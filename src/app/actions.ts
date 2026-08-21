// ─────────────────────────────────────────────────────────────────
// Data layer — Dexie (IndexedDB) is the SINGLE source of truth.
// Fully local & offline, per-device. No server database.
// Function names/signatures mirror the old Prisma server actions so
// every page keeps working without import changes.
// ─────────────────────────────────────────────────────────────────
import { z } from "zod";
import {
  db,
  uid,
  type SubjectRec,
  type TopicRec,
  type NoteRec,
  type BundleRec,
  type FlashcardRec,
  type StudySessionRec,
  type ReviewLogRec,
} from "@/lib/db";
import {
  subjectSchema,
  topicSchema,
  noteSchema,
  bundleSchema,
  bundleCardSchema,
  importBatchSchema,
  type SubjectInput,
} from "@/lib/validations";

// ─── Include helpers (mirror Prisma `include` shapes) ────────────
async function topicInclude(topicId?: string | null) {
  if (!topicId) return null;
  const topic = await db.topics.get(topicId);
  if (!topic) return null;
  const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
  return {
    id: topic.id,
    name: topic.name,
    subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
  };
}

async function bundleInclude(bundleId?: string | null) {
  if (!bundleId) return null;
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) return null;
  return { id: bundle.id, name: bundle.name, color: bundle.color };
}

async function cardTagsInclude(cardId: string) {
  const links = await db.cardTags.where("cardId").equals(cardId).toArray();
  const out: { tag: { id: string; name: string } }[] = [];
  for (const l of links) {
    const tag = await db.tags.get(l.tagId);
    if (tag) out.push({ tag: { id: tag.id, name: tag.name } });
  }
  return out;
}

async function noteTagsInclude(noteId: string) {
  const links = await db.noteTags.where("noteId").equals(noteId).toArray();
  const out: { tag: { id: string; name: string } }[] = [];
  for (const l of links) {
    const tag = await db.tags.get(l.tagId);
    if (tag) out.push({ tag: { id: tag.id, name: tag.name } });
  }
  return out;
}

async function subjectCounts(subjectId: string) {
  const [topics, flashcards, studySessions] = await Promise.all([
    db.topics.where("subjectId").equals(subjectId).count(),
    db.flashcards.where("subjectId").equals(subjectId).count(),
    db.studySessions.where("subjectId").equals(subjectId).count(),
  ]);
  return { topics, flashcards, studySessions };
}

async function topicCounts(topicId: string) {
  const [resources, notes, flashcards] = await Promise.all([
    db.resources.where("topicId").equals(topicId).count(),
    db.notes.where("topicId").equals(topicId).count(),
    db.flashcards.where("topicId").equals(topicId).count(),
  ]);
  return { resources, notes, flashcards };
}

async function upsertTag(name: string): Promise<{ id: string; name: string }> {
  const existing = await db.tags.where("name").equals(name).first();
  if (existing) return existing;
  const tag = { id: uid(), name };
  await db.tags.add(tag);
  return tag;
}

// ─── Subjects ─────────────────────────────────────────────────────
export async function getSubjects() {
  const all = await db.subjects.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (s) => ({ ...s, _count: await subjectCounts(s.id) }))
  );
}

export async function getSubject(id: string) {
  const subject = await db.subjects.get(id);
  if (!subject) throw new Error("Subject not found");
  const topics = await db.topics.where("subjectId").equals(id).sortBy("order");
  const topicsWithCounts = await Promise.all(
    topics.map(async (t) => ({ ...t, _count: await topicCounts(t.id) }))
  );
  return { ...subject, topics: topicsWithCounts, _count: await subjectCounts(id) };
}

export async function createSubject(input: SubjectInput) {
  const parsed = subjectSchema.parse(input);
  const now = new Date();
  const subject: SubjectRec = { id: uid(), ...parsed, createdAt: now, updatedAt: now };
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(id: string, input: Partial<SubjectInput>) {
  const parsed = subjectSchema.partial().parse(input);
  await db.subjects.update(id, { ...parsed, updatedAt: new Date() });
  return db.subjects.get(id);
}

export async function deleteSubject(id: string) {
  const subject = await db.subjects.get(id);
  // Cascade: topics → (resources, notes, flashcards), subject's flashcards/sessions
  const topics = await db.topics.where("subjectId").equals(id).toArray();
  for (const t of topics) {
    await db.resources.where("topicId").equals(t.id).delete();
    const notes = await db.notes.where("topicId").equals(t.id).toArray();
    for (const n of notes) await db.noteTags.where("noteId").equals(n.id).delete();
    await db.notes.where("topicId").equals(t.id).delete();
    const cards = await db.flashcards.where("topicId").equals(t.id).toArray();
    for (const c of cards) await db.cardTags.where("cardId").equals(c.id).delete();
    await db.flashcards.where("topicId").equals(t.id).delete();
  }
  await db.topics.where("subjectId").equals(id).delete();
  await db.flashcards.where("subjectId").equals(id).modify({ subjectId: null });
  await db.studySessions.where("subjectId").equals(id).modify({ subjectId: null });
  if (subject) await db.subjects.delete(id);
  return subject;
}

// ─── Topics ───────────────────────────────────────────────────────
export async function getTopics(subjectId: string) {
  const topics = await db.topics.where("subjectId").equals(subjectId).sortBy("order");
  return Promise.all(topics.map(async (t) => ({ ...t, _count: await topicCounts(t.id) })));
}

export async function createTopic(data: {
  subjectId: string;
  name: string;
  description?: string;
  order?: number;
}) {
  const parsed = topicSchema.parse(data);
  const now = new Date();
  const topic: TopicRec = { id: uid(), ...parsed, createdAt: now, updatedAt: now };
  await db.topics.add(topic);
  return topic;
}

export async function deleteTopic(id: string) {
  const topic = await db.topics.get(id);
  await db.resources.where("topicId").equals(id).delete();
  const notes = await db.notes.where("topicId").equals(id).toArray();
  for (const n of notes) await db.noteTags.where("noteId").equals(n.id).delete();
  await db.notes.where("topicId").equals(id).delete();
  const cards = await db.flashcards.where("topicId").equals(id).toArray();
  for (const c of cards) await db.cardTags.where("cardId").equals(c.id).delete();
  await db.flashcards.where("topicId").equals(id).delete();
  await db.studySessions.where("topicId").equals(id).modify({ topicId: null });
  if (topic) await db.topics.delete(id);
  return topic;
}

export async function updateTopic(
  id: string,
  data: { name?: string; description?: string }
) {
  const parsed = topicSchema.partial().parse(data);
  await db.topics.update(id, { ...parsed, updatedAt: new Date() });
  return db.topics.get(id);
}

// ─── Notes ────────────────────────────────────────────────────────
export async function getNotes(topicId: string) {
  const notes = await db.notes.where("topicId").equals(topicId).toArray();
  notes.sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return Promise.all(notes.map(async (n) => ({ ...n, tags: await noteTagsInclude(n.id) })));
}

export async function createNote(data: {
  topicId: string;
  title: string;
  content?: string;
  isPinned?: boolean;
  tags?: string[];
}) {
  const parsed = noteSchema.parse(data);
  const { tags, ...noteData } = parsed;
  const now = new Date();
  const note: NoteRec = { id: uid(), ...noteData, createdAt: now, updatedAt: now };
  await db.notes.add(note);
  for (const tagName of tags ?? []) {
    const tag = await upsertTag(tagName);
    await db.noteTags.add({ noteId: note.id, tagId: tag.id });
  }
  return { ...note, tags: await noteTagsInclude(note.id) };
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string; isPinned?: boolean; tags?: string[] }
) {
  const parsed = noteSchema.partial().parse(data);
  const { tags, ...noteData } = parsed;
  await db.notes.update(id, { ...noteData, updatedAt: new Date() });
  if (tags) {
    await db.noteTags.where("noteId").equals(id).delete();
    for (const tagName of tags) {
      const tag = await upsertTag(tagName);
      await db.noteTags.add({ noteId: id, tagId: tag.id });
    }
  }
  return db.notes.get(id);
}

export async function deleteNote(id: string) {
  const note = await db.notes.get(id);
  await db.noteTags.where("noteId").equals(id).delete();
  if (note) await db.notes.delete(id);
  return note;
}

// ─── Flashcards ───────────────────────────────────────────────────
export async function getFlashcards(topicId?: string, subjectId?: string) {
  let cards = await db.flashcards.toArray();
  if (topicId) cards = cards.filter((c) => c.topicId === topicId);
  if (subjectId) cards = cards.filter((c) => c.subjectId === subjectId);
  cards.sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime());
  return Promise.all(cards.map(async (c) => ({ ...c, topic: await topicInclude(c.topicId) })));
}

export async function getDueFlashcards() {
  const now = Date.now();
  const all = await db.flashcards.toArray();
  const due = all
    .filter((c) => c.nextReview.getTime() <= now)
    .sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())
    .slice(0, 20);
  return Promise.all(due.map(async (c) => ({ ...c, topic: await topicInclude(c.topicId) })));
}

// All due cards across every bundle (for "Study All Due").
export async function getAllDueFlashcards() {
  const now = Date.now();
  const all = await db.flashcards.toArray();
  const due = all
    .filter((c) => c.nextReview.getTime() <= now)
    .sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())
    .slice(0, 2000);
  return Promise.all(
    due.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
    }))
  );
}

export async function createFlashcard(data: {
  topicId: string;
  subjectId?: string;
  front: string;
  back: string;
  difficulty?: number;
}) {
  const parsed = z.object({
    topicId: z.string().min(1),
    subjectId: z.string().min(1).optional(),
    front: z.string().min(1).max(2000),
    back: z.string().min(1).max(5000),
    difficulty: z.number().int().min(1).max(5).optional(),
  }).parse(data);
  const now = new Date();
  const card: FlashcardRec = {
    id: uid(),
    topicId: parsed.topicId,
    subjectId: parsed.subjectId ?? null,
    bundleId: null,
    front: parsed.front,
    back: parsed.back,
    difficulty: parsed.difficulty ?? 1,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now, // immediately due
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  return card;
}

export async function updateFlashcard(
  id: string,
  data: { front?: string; back?: string; topicId?: string; tags?: string[] }
) {
  const parsed = z.object({
    front: z.string().min(1).max(2000).optional(),
    back: z.string().min(1).max(5000).optional(),
    topicId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  }).parse(data);
  const { tags, ...rest } = parsed;
  await db.flashcards.update(id, { ...rest, updatedAt: new Date() });
  if (tags) await setCardTags(id, tags);
  return db.flashcards.get(id);
}

export async function reviewFlashcard(id: string, quality: number) {
  const card = await db.flashcards.get(id);
  if (!card) throw new Error("Flashcard not found");

  // SM-2 algorithm
  let newEF = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  if (quality < 3) {
    newInterval = 1;
  } else if (card.reviewCount === 0) {
    newInterval = 1;
  } else if (card.reviewCount === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.min(Math.round(card.intervalDays * newEF), 365);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  await db.flashcards.update(id, {
    easeFactor: newEF,
    intervalDays: newInterval,
    nextReview,
    lastReview: new Date(),
    reviewCount: card.reviewCount + 1,
    difficulty: quality,
    updatedAt: new Date(),
  });
  return db.flashcards.get(id);
}

// ─── Flashcard Management (MANAGE ALL) ──────────────────────────
export async function getAllFlashcards() {
  const all = await db.flashcards.toArray();
  all.sort((a, b) => a.reviewCount - b.reviewCount || b.createdAt.getTime() - a.createdAt.getTime());
  const cards = all.slice(0, 2000);
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
      tags: await cardTagsInclude(c.id),
    }))
  );
}

export async function deleteFlashcard(id: string) {
  const card = await db.flashcards.get(id);
  await db.cardTags.where("cardId").equals(id).delete();
  await db.reviewLogs.where("flashcardId").equals(id).delete();
  if (card) await db.flashcards.delete(id);
  return card;
}

// ─── Study Sessions ───────────────────────────────────────────────
export async function getStudySessions(limit = 50) {
  const all = await db.studySessions.orderBy("startedAt").reverse().toArray();
  const sessions = all.slice(0, limit);
  return Promise.all(
    sessions.map(async (s) => {
      const subject = s.subjectId ? await db.subjects.get(s.subjectId) : undefined;
      const topic = s.topicId ? await db.topics.get(s.topicId) : undefined;
      return {
        ...s,
        subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
        topic: topic ? { id: topic.id, name: topic.name } : null,
      };
    })
  );
}

export async function createStudySession(data: {
  subjectId?: string;
  topicId?: string;
  title: string;
  durationMin: number;
  notes?: string;
  completed?: boolean;
  startedAt?: Date;
}) {
  const now = new Date();
  const session: StudySessionRec = {
    id: uid(),
    subjectId: data.subjectId ?? null,
    topicId: data.topicId ?? null,
    title: data.title,
    durationMin: data.durationMin,
    notes: data.notes ?? null,
    completed: data.completed ?? true,
    startedAt: data.startedAt ?? now,
    endedAt: now,
  };
  await db.studySessions.add(session);
  return session;
}

export async function deleteStudySession(id: string) {
  const session = await db.studySessions.get(id);
  if (session) await db.studySessions.delete(id);
  return session;
}

// ─── Dashboard Stats ──────────────────────────────────────────────
export async function getDashboardStats() {
  const [subjects, topics, flashcards, sessions] = await Promise.all([
    db.subjects.count(),
    db.topics.count(),
    db.flashcards.toArray(),
    db.studySessions.orderBy("startedAt").reverse().toArray(),
  ]);
  const now = Date.now();
  const dueCards = flashcards.filter((c) => c.nextReview.getTime() <= now).length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
  const recent = sessions.slice(0, 5);
  const recentSessions = await Promise.all(
    recent.map(async (s) => {
      const subject = s.subjectId ? await db.subjects.get(s.subjectId) : undefined;
      return {
        ...s,
        subject: subject ? { name: subject.name, color: subject.color } : null,
      };
    })
  );
  return {
    totalSubjects: subjects,
    totalTopics: topics,
    totalFlashcards: flashcards.length,
    totalSessions: sessions.length,
    dueCards,
    totalMinutes,
    recentSessions,
  };
}

// ─── Global Queries (for Notes page) ─────────────────────────────
export async function getAllTopics() {
  const all = await db.topics.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (t) => {
      const subject = t.subjectId ? await db.subjects.get(t.subjectId) : undefined;
      return {
        ...t,
        subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
        _count: await topicCounts(t.id),
      };
    })
  );
}

export async function getAllNotes() {
  const all = await db.notes.toArray();
  all.sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return Promise.all(
    all.map(async (n) => {
      const topic = n.topicId ? await db.topics.get(n.topicId) : undefined;
      let topicInc: { id: string; name: string; subject: { name: string; color: string } | null } | null = null;
      if (topic) {
        const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
        topicInc = {
          id: topic.id,
          name: topic.name,
          subject: subject ? { name: subject.name, color: subject.color } : null,
        };
      }
      return { ...n, tags: await noteTagsInclude(n.id), topic: topicInc };
    })
  );
}

// ─── Bundles (Flashcard Decks) ─────────────────────────────────
export async function getBundles() {
  const all = await db.bundles.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (b) => ({
      ...b,
      _count: { flashcards: await db.flashcards.where("bundleId").equals(b.id).count() },
    }))
  );
}

export async function getBundle(id: string) {
  const bundle = await db.bundles.get(id);
  if (!bundle) return null;
  return {
    ...bundle,
    _count: { flashcards: await db.flashcards.where("bundleId").equals(id).count() },
  };
}

export async function createBundle(data: { name: string; description?: string; color?: string }) {
  const parsed = bundleSchema.parse(data);
  const now = new Date();
  const bundle: BundleRec = { id: uid(), ...parsed, createdAt: now, updatedAt: now };
  await db.bundles.add(bundle);
  return bundle;
}

export async function updateBundle(id: string, data: { name?: string; description?: string; color?: string }) {
  const parsed = bundleSchema.partial().parse(data);
  await db.bundles.update(id, { ...parsed, updatedAt: new Date() });
  return db.bundles.get(id);
}

export async function deleteBundle(id: string) {
  // Delete the bundle's flashcards first (and their tags/logs),
  // then the bundle itself — matches "DELETE & ALL ITS FLASHCARDS".
  const cards = await db.flashcards.where("bundleId").equals(id).toArray();
  for (const c of cards) {
    await db.cardTags.where("cardId").equals(c.id).delete();
    await db.reviewLogs.where("flashcardId").equals(c.id).delete();
  }
  await db.flashcards.where("bundleId").equals(id).delete();
  const bundle = await db.bundles.get(id);
  if (bundle) await db.bundles.delete(id);
  return bundle;
}

export async function getBundleCards(bundleId: string) {
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      tags: await cardTagsInclude(c.id),
    }))
  );
}

// ─── Card tag helpers ────────────────────────────────────────
export async function setCardTags(cardId: string, tagNames: string[]) {
  await db.cardTags.where("cardId").equals(cardId).delete();
  for (const name of tagNames) {
    const tag = await upsertTag(name);
    await db.cardTags.add({ cardId, tagId: tag.id });
  }
}

// ─── Review with Logging + Leech Detection ────────────────────
export async function reviewFlashcardWithLog(id: string, quality: number) {
  const q = z.number().int().min(0).max(5).parse(quality);
  const card = await db.flashcards.get(id);
  if (!card) throw new Error("Flashcard not found");

  // SM-2 algorithm
  let newEF = card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  if (q < 3) {
    newInterval = 1;
  } else if (card.reviewCount === 0) {
    newInterval = 1;
  } else if (card.reviewCount === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.min(Math.round(card.intervalDays * newEF), 365);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  // Leech detection: 5 consecutive Again → flag
  const newConsecutive = q < 3 ? card.consecutiveAgain + 1 : 0;
  const isLeech = newConsecutive >= 5;

  await db.flashcards.update(id, {
    easeFactor: newEF,
    intervalDays: newInterval,
    nextReview,
    lastReview: new Date(),
    reviewCount: card.reviewCount + 1,
    difficulty: q,
    consecutiveAgain: newConsecutive,
    isLeech,
    updatedAt: new Date(),
  });

  // Log the review
  const log: ReviewLogRec = { id: uid(), flashcardId: id, quality: q, reviewedAt: new Date() };
  await db.reviewLogs.add(log);

  return db.flashcards.get(id);
}

// ─── Leech Cards ──────────────────────────────────────────────
export async function getLeechCards(bundleId?: string) {
  // IndexedDB can't index booleans, so filter in JS.
  let cards = (await db.flashcards.toArray()).filter((c) => c.isLeech === true);
  if (bundleId) cards = cards.filter((c) => c.bundleId === bundleId);
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
    }))
  );
}

export async function unLeechCard(id: string) {
  await db.flashcards.update(id, { isLeech: false, consecutiveAgain: 0, updatedAt: new Date() });
  return db.flashcards.get(id);
}

// ─── Heatmap & Streak ─────────────────────────────────────────
export async function getHeatmapData() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const logs = await db.reviewLogs
    .where("reviewedAt")
    .aboveOrEqual(ninetyDaysAgo)
    .toArray();

  const counts = new Map<string, number>();
  for (const log of logs) {
    const date = new Date(log.reviewedAt).toISOString().split("T")[0];
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

export async function getStreak() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - 365);
  const logs = await db.reviewLogs.where("reviewedAt").aboveOrEqual(lookback).toArray();

  const reviewDates = new Set<string>();
  for (const log of logs) {
    reviewDates.add(new Date(log.reviewedAt).toISOString().split("T")[0]);
  }

  let streak = 0;
  const checkDate = new Date(today);
  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (!reviewDates.has(dateStr)) break;
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

// ─── Bundle Flashcard Creation ────────────────────────────────
export async function createBundleFlashcard(data: {
  bundleId: string;
  front: string;
  back: string;
  tags?: string[];
}) {
  const parsed = bundleCardSchema.parse(data);
  const { tags, ...rest } = parsed;
  const now = new Date();
  const card: FlashcardRec = {
    id: uid(),
    topicId: null,
    subjectId: null,
    bundleId: rest.bundleId,
    front: rest.front,
    back: rest.back,
    difficulty: 1,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  if (tags?.length) await setCardTags(card.id, tags);
  return card;
}

// ─── Import a batch of cards (parsed from CSV/Anki/JSON) ──────
export async function importCardsIntoBundle(
  bundleId: string,
  cards: { front: string; back: string; tags?: string[] }[]
) {
  const parsed = importBatchSchema.parse(
    (cards ?? []).map((c) => ({ front: c.front, back: c.back, tags: c.tags }))
  );

  const now = new Date();
  const newCards: FlashcardRec[] = parsed.map((c) => ({
    id: uid(),
    topicId: null,
    subjectId: null,
    bundleId,
    front: c.front,
    back: c.back,
    difficulty: 1,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  }));
  await db.flashcards.bulkAdd(newCards);

  // Tag links
  const links: { cardId: string; tagId: string }[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (const name of parsed[i].tags ?? []) {
      const tag = await upsertTag(name);
      links.push({ cardId: newCards[i].id, tagId: tag.id });
    }
  }
  if (links.length) await db.cardTags.bulkAdd(links);

  return { count: parsed.length };
}

// ─── Import / Export ──────────────────────────────────────────
export type ExportBundle = {
  name: string;
  description?: string | null;
  color?: string;
  cards: { front: string; back: string }[];
};

export async function exportBundle(bundleId: string) {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error("Bundle not found");
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  const payload: ExportBundle = {
    name: bundle.name,
    description: bundle.description,
    color: bundle.color,
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBundleCards(
  bundleId: string,
  cards: { front?: string; back?: string; question?: string; answer?: string; tags?: string[] }[]
) {
  if (!Array.isArray(cards) || cards.length === 0) return { count: 0 };
  // Accept both {front,back} (app export) and {question,answer} (NotebookLM JSON).
  const normalized = cards
    .map((c) => ({
      front: String(c.front ?? c.question ?? "").trim(),
      back: String(c.back ?? c.answer ?? "").trim(),
      tags: Array.isArray(c.tags)
        ? c.tags.map((t) => String(t).trim()).filter(Boolean)
        : undefined,
    }))
    .filter((c) => c.front && c.back);
  if (normalized.length === 0) return { count: 0 };
  return importCardsIntoBundle(bundleId, normalized);
}

// ─── NotebookLM export (markdown source) ─────────────────────
export async function exportBundleMarkdown(bundleId: string): Promise<string> {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error("Bundle not found");
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  cards.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lines: string[] = [];
  lines.push(`# ${bundle.name}`);
  if (bundle.description) lines.push(`\n> ${bundle.description}`);
  lines.push(`\n_Study source exported from Hymerious Study. ${cards.length} cards._\n`);
  if (cards.length === 0) {
    lines.push("_No flashcards in this bundle yet._");
  } else {
    cards.forEach((c, i) => {
      lines.push(`## ${i + 1}. ${c.front}`);
      lines.push(`\n${c.back}\n`);
    });
  }
  return lines.join("\n");
}

export async function exportNotesMarkdown(): Promise<string> {
  const notes = await getAllNotes();
  const lines: string[] = ["# Study Notes", ""];
  if (notes.length === 0) {
    lines.push("_No notes yet._");
  } else {
    notes.forEach((n) => {
      lines.push(`## ${n.title}`);
      if (n.topic) lines.push(`_${n.topic.subject?.name ?? ""} › ${n.topic.name}_\n`);
      lines.push(`${n.content}\n`);
    });
  }
  return lines.join("\n");
}

// ─── Edit bundle from flashcards page ────────────────────────
export async function editBundleFromFlashcards(
  id: string,
  data: { name?: string; description?: string; color?: string }
) {
  const parsed = bundleSchema.partial().parse(data);
  await db.bundles.update(id, { ...parsed, updatedAt: new Date() });
  return db.bundles.get(id);
}

// ─── Batch Card Operations ──────────────────────────────────
export async function batchDeleteCards(ids: string[]) {
  if (!ids.length) return { count: 0 };
  for (const id of ids) {
    await db.cardTags.where("cardId").equals(id).delete();
    await db.reviewLogs.where("flashcardId").equals(id).delete();
  }
  await db.flashcards.bulkDelete(ids);
  return { count: ids.length };
}

export async function batchTagCards(ids: string[], tagNames: string[]) {
  if (!ids.length || !tagNames.length) return { count: 0 };
  const links: { cardId: string; tagId: string }[] = [];
  for (const cardId of ids) {
    for (const name of tagNames) {
      const tag = await upsertTag(name);
      links.push({ cardId, tagId: tag.id });
    }
  }
  // Skip links that already exist
  const newLinks: { cardId: string; tagId: string }[] = [];
  for (const l of links) {
    const exists = await db.cardTags.get([l.cardId, l.tagId]);
    if (!exists) newLinks.push(l);
  }
  if (newLinks.length) await db.cardTags.bulkAdd(newLinks);
  return { count: ids.length };
}

export async function batchMoveCards(ids: string[], targetBundleId: string | null) {
  if (!ids.length) return { count: 0 };
  for (const id of ids) {
    await db.flashcards.update(id, { bundleId: targetBundleId, updatedAt: new Date() });
  }
  return { count: ids.length };
}

// ─── Full Data Export / Import ───────────────────────────────
export type FullExport = {
  version: 1;
  exportedAt: string;
  subjects: {
    name: string;
    description?: string | null;
    color: string;
    icon: string;
    topics: {
      name: string;
      description?: string | null;
      order: number;
      notes: { title: string; content: string; isPinned: boolean; tags: string[] }[];
      flashcards: { front: string; back: string; difficulty: number; tags: string[] }[];
    }[];
  }[];
  bundles: {
    name: string;
    description?: string | null;
    color: string;
    flashcards: { front: string; back: string; tags: string[] }[];
  }[];
  sessions: {
    title: string;
    durationMin: number;
    notes?: string | null;
    completed: boolean;
    startedAt: string;
  }[];
};

export async function exportAllData(): Promise<string> {
  const [subjects, bundles, sessions] = await Promise.all([
    db.subjects.toArray(),
    db.bundles.toArray(),
    db.studySessions.orderBy("startedAt").toArray(),
  ]);

  const exportData: FullExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects: [],
    bundles: [],
    sessions: sessions.map((s) => ({
      title: s.title,
      durationMin: s.durationMin,
      notes: s.notes,
      completed: s.completed,
      startedAt: new Date(s.startedAt).toISOString(),
    })),
  };

  for (const s of subjects) {
    const topics = await db.topics.where("subjectId").equals(s.id).sortBy("order");
    const topicEntries = [];
    for (const t of topics) {
      const notes = await db.notes.where("topicId").equals(t.id).toArray();
      const noteEntries = [];
      for (const n of notes) {
        const tags = (await noteTagsInclude(n.id)).map((nt) => nt.tag.name);
        noteEntries.push({ title: n.title, content: n.content, isPinned: n.isPinned, tags });
      }
      const cards = await db.flashcards.where("topicId").equals(t.id).toArray();
      const cardEntries = [];
      for (const c of cards) {
        const tags = (await cardTagsInclude(c.id)).map((ct) => ct.tag.name);
        cardEntries.push({ front: c.front, back: c.back, difficulty: c.difficulty, tags });
      }
      topicEntries.push({
        name: t.name,
        description: t.description,
        order: t.order,
        notes: noteEntries,
        flashcards: cardEntries,
      });
    }
    exportData.subjects.push({
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      topics: topicEntries,
    });
  }

  for (const b of bundles) {
    const cards = await db.flashcards.where("bundleId").equals(b.id).toArray();
    const cardEntries = [];
    for (const c of cards) {
      const tags = (await cardTagsInclude(c.id)).map((ct) => ct.tag.name);
      cardEntries.push({ front: c.front, back: c.back, tags });
    }
    exportData.bundles.push({
      name: b.name,
      description: b.description,
      color: b.color,
      flashcards: cardEntries,
    });
  }

  return JSON.stringify(exportData, null, 2);
}

export async function importAllData(json: string): Promise<{ imported: string }> {
  const data = JSON.parse(json) as FullExport;
  if (!data.version || !data.subjects) throw new Error("Invalid backup file");

  let imported = "";

  // Import subjects → topics → notes + flashcards
  for (const s of data.subjects) {
    const subject = await createSubject({
      name: s.name,
      description: s.description ?? undefined,
      color: s.color,
      icon: s.icon,
    });
    imported += `subject "${s.name}" `;
    for (const t of s.topics) {
      const topic = await createTopic({
        subjectId: subject.id,
        name: t.name,
        description: t.description ?? undefined,
        order: t.order,
      });
      for (const n of t.notes) {
        await createNote({
          topicId: topic.id,
          title: n.title,
          content: n.content,
          isPinned: n.isPinned,
          tags: n.tags,
        });
      }
      for (const c of t.flashcards) {
        const card = await createFlashcard({
          topicId: topic.id,
          front: c.front,
          back: c.back,
          difficulty: c.difficulty,
        });
        if (c.tags.length) await setCardTags(card.id, c.tags);
      }
    }
  }

  // Import bundles → flashcards
  for (const b of data.bundles) {
    const bundle = await createBundle({
      name: b.name,
      description: b.description ?? undefined,
      color: b.color,
    });
    imported += `bundle "${b.name}" `;
    for (const c of b.flashcards) {
      const card = await createBundleFlashcard({
        bundleId: bundle.id,
        front: c.front,
        back: c.back,
      });
      if (c.tags.length) await setCardTags(card.id, c.tags);
    }
  }

  // Import sessions
  for (const s of data.sessions) {
    await createStudySession({
      title: s.title,
      durationMin: s.durationMin,
      notes: s.notes ?? undefined,
      completed: s.completed,
      startedAt: new Date(s.startedAt),
    });
  }
  imported += `${data.sessions.length} sessions`;

  return { imported };
}
