"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { subjectSchema, topicSchema, noteSchema, bundleSchema, bundleCardSchema, importBatchSchema, type SubjectInput, type TopicInput, type NoteInput } from "@/lib/validations";

// ─── Subjects ─────────────────────────────────────────────────────
export async function getSubjects() {
  return db.subject.findMany({
    include: {
      _count: { select: { topics: true, flashcards: true, studySessions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSubject(id: string) {
  const subject = await db.subject.findUnique({
    where: { id },
    include: {
      topics: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { resources: true, notes: true, flashcards: true } },
        },
      },
      _count: { select: { flashcards: true, studySessions: true } },
    },
  });
  if (!subject) throw new Error("Subject not found");
  return subject;
}

export async function createSubject(input: SubjectInput) {
  const parsed = subjectSchema.parse(input);
  const result = await db.subject.create({ data: parsed });
  revalidatePath("/subjects");
  revalidatePath("/");
  return result;
}

export async function updateSubject(id: string, input: Partial<SubjectInput>) {
  const parsed = subjectSchema.partial().parse(input);
  const updated = await db.subject.update({ where: { id }, data: parsed });
  revalidatePath("/subjects");
  return updated;
}

export async function deleteSubject(id: string) {
  const result = await db.subject.delete({ where: { id } });
  revalidatePath("/subjects");
  return result;
}

// ─── Topics ───────────────────────────────────────────────────────
export async function getTopics(subjectId: string) {
  return db.topic.findMany({
    where: { subjectId },
    orderBy: { order: "asc" },
    include: {
      _count: { select: { resources: true, notes: true, flashcards: true } },
    },
  });
}

export async function createTopic(data: {
  subjectId: string;
  name: string;
  description?: string;
  order?: number;
}) {
  const parsed = topicSchema.parse(data);
  const topic = await db.topic.create({ data: parsed });
  revalidatePath("/subjects");
  return topic;
}

export async function deleteTopic(id: string) {
  const result = await db.topic.delete({ where: { id } });
  revalidatePath("/subjects");
  return result;
}

export async function updateTopic(
  id: string,
  data: { name?: string; description?: string }
) {
  const parsed = topicSchema.partial().parse(data);
  return db.topic.update({ where: { id }, data: parsed });
}

// ─── Notes ────────────────────────────────────────────────────────
export async function getNotes(topicId: string) {
  return db.note.findMany({
    where: { topicId },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    include: { tags: { include: { tag: true } } },
  });
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
  const result = await db.note.create({
    data: {
      ...noteData,
      tags: tags?.length
        ? {
            create: await Promise.all(
              tags.map(async (tagName) => ({
                tag: {
                  connectOrCreate: { where: { name: tagName }, create: { name: tagName } },
                },
              }))
            ),
          }
        : undefined,
    },
    include: { tags: { include: { tag: true } } },
  });
  revalidatePath("/notes");
  return result;
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string; isPinned?: boolean; tags?: string[] }
) {
  const parsed = noteSchema.partial().parse(data);
  const { tags, ...noteData } = parsed;

  const updated = await db.note.update({ where: { id }, data: noteData });

  if (tags) {
    await db.noteTag.deleteMany({ where: { noteId: id } });
    for (const tagName of tags) {
      const tag = await db.tag.upsert({
        where: { name: tagName },
        create: { name: tagName },
        update: {},
      });
      await db.noteTag.create({ data: { noteId: id, tagId: tag.id } });
    }
  }

  return updated;
}

export async function deleteNote(id: string) {
  const result = await db.note.delete({ where: { id } });
  revalidatePath("/notes");
  return result;
}

// ─── Flashcards ───────────────────────────────────────────────────
export async function getFlashcards(topicId?: string, subjectId?: string) {
  const where = {
    ...(topicId && { topicId }),
    ...(subjectId && { subjectId }),
  };
  return db.flashcard.findMany({
    where,
    orderBy: { nextReview: "asc" },
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          subject: { select: { name: true } },
        },
      },
    },
  });
}

export async function getDueFlashcards() {
  return db.flashcard.findMany({
    where: { nextReview: { lte: new Date() } },
    orderBy: { nextReview: "asc" },
    take: 20,
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          subject: { select: { name: true } },
        },
      },
    },
  });
}

// All due cards across every bundle (for "Study All Due").
export async function getAllDueFlashcards() {
  // Push the due-date filter into the DB (was: fetch ALL cards, filter in JS).
  // `take` is a safety valve so a pathological deck can't OOM the server action.
  return db.flashcard.findMany({
    where: { nextReview: { lte: new Date() } },
    orderBy: { nextReview: "asc" },
    take: 2000,
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          subject: { select: { name: true } },
        },
      },
      bundle: { select: { id: true, name: true } },
    },
  });
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
  const result = await db.flashcard.create({
    data: {
      ...parsed,
      // Explicitly set so new cards are immediately due (same clock as getDueFlashcards)
      nextReview: now,
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
    },
  });
  revalidatePath("/flashcards");
  revalidatePath("/");
  return result;
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
  const updated = await db.flashcard.update({ where: { id }, data: rest });

  if (tags) {
    await db.cardTag.deleteMany({ where: { cardId: id } });
    for (const tagName of tags) {
      const tag = await db.tag.upsert({
        where: { name: tagName },
        create: { name: tagName },
        update: {},
      });
      await db.cardTag.create({ data: { cardId: id, tagId: tag.id } });
    }
  }

  return updated;
}

export async function reviewFlashcard(id: string, quality: number) {
  const card = await db.flashcard.findUnique({ where: { id } });
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

  return db.flashcard.update({
    where: { id },
    data: {
      easeFactor: newEF,
      intervalDays: newInterval,
      nextReview,
      lastReview: new Date(),
      reviewCount: { increment: 1 },
      difficulty: quality,
    },
  });
}

// ─── Flashcard Management (MANAGE ALL) ──────────────────────────
export async function getAllFlashcards() {
  // `take` is a safety valve for pathological decks; browse renders this
  // client-side, so an unbounded result would jank the page.
  return db.flashcard.findMany({
    orderBy: [{ reviewCount: "asc" }, { createdAt: "desc" }],
    take: 2000,
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          subject: { select: { name: true, color: true } },
        },
      },
      bundle: { select: { id: true, name: true, color: true } },
      tags: { include: { tag: true } },
    },
  });
}

export async function deleteFlashcard(id: string) {
  const result = await db.flashcard.delete({ where: { id } });
  revalidatePath("/flashcards");
  return result;
}

// ─── Study Sessions ───────────────────────────────────────────────
export async function getStudySessions(limit = 50) {
  return db.studySession.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      subject: { select: { id: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
    },
  });
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
  const result = await db.studySession.create({
    data: {
      ...data,
      completed: data.completed ?? true,
      startedAt: data.startedAt ?? now,
      endedAt: now,
    },
  });
  revalidatePath("/sessions");
  revalidatePath("/");
  return result;
}

export async function deleteStudySession(id: string) {
  const result = await db.studySession.delete({ where: { id } });
  revalidatePath("/sessions");
  return result;
}

// ─── Dashboard Stats ──────────────────────────────────────────────
export async function getDashboardStats() {
  const [totalSubjects, totalTopics, totalFlashcards, totalSessions, dueCards, recentSessions] =
    await Promise.all([
      db.subject.count(),
      db.topic.count(),
      db.flashcard.count(),
      db.studySession.count(),
      db.flashcard.count({ where: { nextReview: { lte: new Date() } } }),
      db.studySession.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
        include: {
          subject: { select: { name: true, color: true } },
        },
      }),
    ]);

  const totalMinutes = await db.studySession.aggregate({
    _sum: { durationMin: true },
  });

  return {
    totalSubjects,
    totalTopics,
    totalFlashcards,
    totalSessions,
    dueCards,
    totalMinutes: totalMinutes._sum.durationMin ?? 0,
    recentSessions,
  };
}

// ─── Global Queries (for Notes page) ─────────────────────────────
export async function getAllTopics() {
  return db.topic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subject: { select: { id: true, name: true, color: true } },
      _count: { select: { resources: true, notes: true, flashcards: true } },
    },
  });
}

export async function getAllNotes() {
  return db.note.findMany({
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    include: {
      tags: { include: { tag: true } },
      topic: { select: { id: true, name: true, subject: { select: { name: true, color: true } } } },
    },
  });
}

// ─── Bundles (Flashcard Decks) ─────────────────────────────────
export async function getBundles() {
  return db.bundle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { flashcards: true } },
    },
  });
}

export async function getBundle(id: string) {
  return db.bundle.findUnique({
    where: { id },
    include: {
      _count: { select: { flashcards: true } },
    },
  });
}

export async function createBundle(data: { name: string; description?: string; color?: string }) {
  const parsed = bundleSchema.parse(data);
  const result = await db.bundle.create({ data: parsed });
  revalidatePath("/bundles");
  revalidatePath("/");
  return result;
}

export async function updateBundle(id: string, data: { name?: string; description?: string; color?: string }) {
  const parsed = bundleSchema.partial().parse(data);
  return db.bundle.update({ where: { id }, data: parsed });
}

export async function deleteBundle(id: string) {
  // Delete the bundle's flashcards first (and their review logs cascade),
  // then the bundle itself — matches the modal promise "DELETE & ALL ITS FLASHCARDS".
  await db.flashcard.deleteMany({ where: { bundleId: id } });
  const result = await db.bundle.delete({ where: { id } });
  revalidatePath("/bundles");
  revalidatePath("/flashcards");
  return result;
}

export async function getBundleCards(bundleId: string) {
  return db.flashcard.findMany({
    where: { bundleId },
    orderBy: { createdAt: "desc" },
    include: {
      topic: { select: { id: true, name: true, subject: { select: { name: true } } } },
      tags: { include: { tag: true } },
    },
  });
}

// ─── Card tag helpers ────────────────────────────────────────
export async function setCardTags(cardId: string, tagNames: string[]) {
  await db.cardTag.deleteMany({ where: { cardId } });
  for (const name of tagNames) {
    const tag = await db.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await db.cardTag.create({ data: { cardId, tagId: tag.id } });
  }
}

// ─── Review with Logging + Leech Detection ────────────────────
export async function reviewFlashcardWithLog(id: string, quality: number) {
  const q = z.number().int().min(0).max(5).parse(quality);
  const card = await db.flashcard.findUnique({ where: { id } });
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

  // Update card
  const updated = await db.flashcard.update({
    where: { id },
    data: {
      easeFactor: newEF,
      intervalDays: newInterval,
      nextReview,
      lastReview: new Date(),
      reviewCount: { increment: 1 },
      difficulty: q,
      consecutiveAgain: newConsecutive,
      isLeech,
    },
  });

  // Log the review
  await db.reviewLog.create({
    data: { flashcardId: id, quality: q },
  });

  return updated;
}

// ─── Leech Cards ──────────────────────────────────────────────
export async function getLeechCards(bundleId?: string) {
  return db.flashcard.findMany({
    where: {
      isLeech: true,
      ...(bundleId && { bundleId }),
    },
    include: {
      topic: { select: { id: true, name: true, subject: { select: { name: true } } } },
      bundle: { select: { id: true, name: true } },
    },
  });
}

export async function unLeechCard(id: string) {
  return db.flashcard.update({
    where: { id },
    data: { isLeech: false, consecutiveAgain: 0 },
  });
}

// ─── Heatmap & Streak ─────────────────────────────────────────
export async function getHeatmapData() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const logs = await db.reviewLog.findMany({
    where: { reviewedAt: { gte: ninetyDaysAgo } },
    select: { reviewedAt: true },
  });

  // Group by date string in JS (Prisma groupBy groups by exact DateTime,
  // so two reviews at different times on the same day would be separate entries).
  const counts = new Map<string, number>();
  for (const log of logs) {
    const date = log.reviewedAt.toISOString().split("T")[0];
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

export async function getStreak() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Single query: fetch all distinct review dates, then compute streak in JS.
  // Avoids the N+1 bug where each day triggered a separate DB query.
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - 365); // safety valve: 1 year max

  const logs = await db.reviewLog.findMany({
    where: { reviewedAt: { gte: lookback } },
    select: { reviewedAt: true },
  });

  // Build a set of unique dates (YYYY-MM-DD) that had reviews
  const reviewDates = new Set<string>();
  for (const log of logs) {
    reviewDates.add(log.reviewedAt.toISOString().split("T")[0]);
  }

  // Walk backwards from today, counting consecutive days
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
  const card = await db.flashcard.create({
    data: {
      ...rest,
      nextReview: new Date(),
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
    },
  });
  if (tags?.length) await setCardTags(card.id, tags);
  revalidatePath("/flashcards");
  revalidatePath("/bundles");
  revalidatePath("/");
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

  // Collect every unique tag name across the whole batch ONCE (no N+1).
  const tagNames = Array.from(
    new Set(parsed.flatMap((c) => (c.tags ?? []).map((t) => t)))
  );
  const tagByName = new Map<string, string>();
  if (tagNames.length) {
    // Upsert all unique tags in one pass, then build name -> id map.
    await db.$transaction(
      tagNames.map((name) =>
        db.tag.upsert({ where: { name }, create: { name }, update: {} })
      )
    );
    const existing = await db.tag.findMany({ where: { name: { in: tagNames } } });
    for (const t of existing) tagByName.set(t.name, t.id);
  }

  // Create all cards in a single transaction, then link tags post-commit.
  const created = await db.$transaction(
    parsed.map((c) =>
      db.flashcard.create({
        data: {
          bundleId,
          front: c.front,
          back: c.back,
          nextReview: new Date(),
          easeFactor: 2.5,
          intervalDays: 0,
          reviewCount: 0,
        },
      })
    )
  );

  // Build per-card tag links from the parsed data + resolved tag map.
  const links: { cardId: string; tagId: string }[] = [];
  parsed.forEach((c, i) => {
    const cardId = (created as { id: string }[])[i]?.id;
    if (!cardId) return;
    for (const name of c.tags ?? []) {
      const tagId = tagByName.get(name);
      if (tagId) links.push({ cardId, tagId });
    }
  });
  if (links.length) {
    await db.cardTag.createMany({ data: links });
  }

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
  const bundle = await db.bundle.findUnique({
    where: { id: bundleId },
    include: {
      flashcards: { select: { front: true, back: true } },
    },
  });
  if (!bundle) throw new Error("Bundle not found");
  const payload: ExportBundle = {
    name: bundle.name,
    description: bundle.description,
    color: bundle.color,
    cards: bundle.flashcards.map((c) => ({ front: c.front, back: c.back })),
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
  const res = await importCardsIntoBundle(bundleId, normalized);
  revalidatePath("/flashcards");
  revalidatePath("/bundles");
  return res;
}

// ─── NotebookLM export (markdown source) ─────────────────────
// NotebookLM has no public API and blocks embedding, so we generate a
// markdown source doc the user can paste/drop into notebook.google.com.
export async function exportBundleMarkdown(bundleId: string): Promise<string> {
  const bundle = await db.bundle.findUnique({
    where: { id: bundleId },
    include: { flashcards: { orderBy: { createdAt: "asc" } } },
  });
  if (!bundle) throw new Error("Bundle not found");
  const lines: string[] = [];
  lines.push(`# ${bundle.name}`);
  if (bundle.description) lines.push(`\n> ${bundle.description}`);
  lines.push(`\n_Study source exported from Hymerious Study. ${bundle.flashcards.length} cards._\n`);
  if (bundle.flashcards.length === 0) {
    lines.push("_No flashcards in this bundle yet._");
  } else {
    bundle.flashcards.forEach((c, i) => {
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
  return db.bundle.update({ where: { id }, data: parsed });
}

// ─── Batch Card Operations ──────────────────────────────────
export async function batchDeleteCards(ids: string[]) {
  if (!ids.length) return { count: 0 };
  const result = await db.flashcard.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/flashcards");
  revalidatePath("/bundles");
  revalidatePath("/");
  return { count: result.count };
}

export async function batchTagCards(ids: string[], tagNames: string[]) {
  if (!ids.length || !tagNames.length) return { count: 0 };
  // Upsert all tags first
  await db.$transaction(
    tagNames.map((name) =>
      db.tag.upsert({ where: { name }, create: { name }, update: {} })
    )
  );
  const tags = await db.tag.findMany({ where: { name: { in: tagNames } } });
  const tagMap = new Map(tags.map((t) => [t.name, t.id]));
  // Build card-tag links
  const links: { cardId: string; tagId: string }[] = [];
  for (const cardId of ids) {
    for (const name of tagNames) {
      const tagId = tagMap.get(name);
      if (tagId) links.push({ cardId, tagId });
    }
  }
  if (links.length) {
    // SQLite doesn't support skipDuplicates on createMany,
    // so filter out links that already exist.
    const existing = await db.cardTag.findMany({
      where: {
        OR: links.map((l) => ({ cardId: l.cardId, tagId: l.tagId })),
      },
      select: { cardId: true, tagId: true },
    });
    const existingSet = new Set(existing.map((e) => `${e.cardId}:${e.tagId}`));
    const newLinks = links.filter((l) => !existingSet.has(`${l.cardId}:${l.tagId}`));
    if (newLinks.length) {
      await db.cardTag.createMany({ data: newLinks });
    }
  }
  revalidatePath("/flashcards");
  return { count: ids.length };
}

export async function batchMoveCards(ids: string[], targetBundleId: string | null) {
  if (!ids.length) return { count: 0 };
  const result = await db.flashcard.updateMany({
    where: { id: { in: ids } },
    data: { bundleId: targetBundleId },
  });
  revalidatePath("/flashcards");
  revalidatePath("/bundles");
  return { count: result.count };
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
    db.subject.findMany({
      include: {
        topics: {
          include: {
            notes: { include: { tags: { include: { tag: true } } } },
            flashcards: { include: { tags: { include: { tag: true } } } },
          },
        },
      },
    }),
    db.bundle.findMany({
      include: { flashcards: { include: { tags: { include: { tag: true } } } } },
    }),
    db.studySession.findMany({ orderBy: { startedAt: "asc" } }),
  ]);

  const exportData: FullExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects: subjects.map((s) => ({
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      topics: s.topics.map((t) => ({
        name: t.name,
        description: t.description,
        order: t.order,
        notes: t.notes.map((n) => ({
          title: n.title,
          content: n.content,
          isPinned: n.isPinned,
          tags: n.tags.map((nt) => nt.tag.name),
        })),
        flashcards: t.flashcards.map((c) => ({
          front: c.front,
          back: c.back,
          difficulty: c.difficulty,
          tags: c.tags.map((ct) => ct.tag.name),
        })),
      })),
    })),
    bundles: bundles.map((b) => ({
      name: b.name,
      description: b.description,
      color: b.color,
      flashcards: b.flashcards.map((c) => ({
        front: c.front,
        back: c.back,
        tags: c.tags.map((ct) => ct.tag.name),
      })),
    })),
    sessions: sessions.map((s) => ({
      title: s.title,
      durationMin: s.durationMin,
      notes: s.notes,
      completed: s.completed,
      startedAt: s.startedAt.toISOString(),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importAllData(json: string): Promise<{ imported: string }> {
  const data = JSON.parse(json) as FullExport;
  if (!data.version || !data.subjects) throw new Error("Invalid backup file");

  let imported = "";

  // Import subjects → topics → notes + flashcards
  for (const s of data.subjects) {
    const subject = await db.subject.create({
      data: { name: s.name, description: s.description, color: s.color, icon: s.icon },
    });
    imported += `subject "${s.name}" `;
    for (const t of s.topics) {
      const topic = await db.topic.create({
        data: { subjectId: subject.id, name: t.name, description: t.description, order: t.order },
      });
      // Notes
      for (const n of t.notes) {
        await db.note.create({
          data: {
            topicId: topic.id,
            title: n.title,
            content: n.content,
            isPinned: n.isPinned,
            tags: n.tags.length
              ? {
                  create: await Promise.all(
                    n.tags.map(async (tagName) => ({
                      tag: { connectOrCreate: { where: { name: tagName }, create: { name: tagName } } },
                    }))
                  ),
                }
              : undefined,
          },
        });
      }
      // Flashcards
      for (const c of t.flashcards) {
        const card = await db.flashcard.create({
          data: {
            topicId: topic.id,
            front: c.front,
            back: c.back,
            difficulty: c.difficulty,
            nextReview: new Date(),
            easeFactor: 2.5,
            intervalDays: 0,
            reviewCount: 0,
          },
        });
        if (c.tags.length) await setCardTags(card.id, c.tags);
      }
    }
  }

  // Import bundles → flashcards
  for (const b of data.bundles) {
    const bundle = await db.bundle.create({
      data: { name: b.name, description: b.description, color: b.color },
    });
    imported += `bundle "${b.name}" `;
    for (const c of b.flashcards) {
      const card = await db.flashcard.create({
        data: {
          bundleId: bundle.id,
          front: c.front,
          back: c.back,
          nextReview: new Date(),
          easeFactor: 2.5,
          intervalDays: 0,
          reviewCount: 0,
        },
      });
      if (c.tags.length) await setCardTags(card.id, c.tags);
    }
  }

  // Import sessions
  for (const s of data.sessions) {
    await db.studySession.create({
      data: {
        title: s.title,
        durationMin: s.durationMin,
        notes: s.notes,
        completed: s.completed,
        startedAt: new Date(s.startedAt),
        endedAt: new Date(s.startedAt),
      },
    });
  }
  imported += `${data.sessions.length} sessions`;

  revalidatePath("/");
  revalidatePath("/subjects");
  revalidatePath("/flashcards");
  revalidatePath("/bundles");
  revalidatePath("/notes");
  revalidatePath("/sessions");
  return { imported };
}
