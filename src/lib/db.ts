import Dexie, { type Table } from "dexie";

// ─── Record types (mirror the previous Prisma models 1:1) ───────
export interface SubjectRec {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicRec {
  id: string;
  subjectId: string;
  name: string;
  description?: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceRec {
  id: string;
  topicId: string;
  title: string;
  url?: string | null;
  type: string;
  notes?: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteRec {
  id: string;
  topicId: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagRec {
  id: string;
  name: string;
}

export interface NoteTagRec {
  noteId: string;
  tagId: string;
}

export interface CardTagRec {
  cardId: string;
  tagId: string;
}

export interface BundleRec {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlashcardRec {
  id: string;
  topicId?: string | null;
  subjectId?: string | null;
  bundleId?: string | null;
  front: string;
  back: string;
  difficulty: number;
  easeFactor: number;
  intervalDays: number;
  nextReview: Date;
  lastReview?: Date | null;
  reviewCount: number;
  consecutiveAgain: number;
  isLeech: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewLogRec {
  id: string;
  flashcardId: string;
  quality: number;
  reviewedAt: Date;
}

export interface StudySessionRec {
  id: string;
  subjectId?: string | null;
  topicId?: string | null;
  title: string;
  durationMin: number;
  notes?: string | null;
  completed: boolean;
  startedAt: Date;
  endedAt?: Date | null;
}

export interface PomoPresetRec {
  id: string;
  name: string;
  workMin: number;
  breakMin: number;
  longBreakMin: number;          // 0 = long break disabled
  cyclesBeforeLongBreak: number; // 0 = long break disabled
  autoAdvance: boolean;
  createdAt: Date;
}

// ─── The database ────────────────────────────────────────────────
// Dexie/IndexedDB is the SINGLE source of truth — fully local,
// fully offline, per-device. No server database anywhere.
class StudyMaxDB extends Dexie {
  subjects!: Table<SubjectRec, string>;
  topics!: Table<TopicRec, string>;
  resources!: Table<ResourceRec, string>;
  notes!: Table<NoteRec, string>;
  tags!: Table<TagRec, string>;
  noteTags!: Table<NoteTagRec, [string, string]>;
  cardTags!: Table<CardTagRec, [string, string]>;
  bundles!: Table<BundleRec, string>;
  flashcards!: Table<FlashcardRec, string>;
  reviewLogs!: Table<ReviewLogRec, string>;
  studySessions!: Table<StudySessionRec, string>;
  pomoPresets!: Table<PomoPresetRec, string>;

  constructor() {
    super("studymax");
    this.version(1).stores({
      subjects: "id, name, createdAt",
      topics: "id, subjectId, createdAt",
      resources: "id, topicId",
      notes: "id, topicId, updatedAt, isPinned",
      tags: "id, &name",
      noteTags: "[noteId+tagId], noteId, tagId",
      cardTags: "[cardId+tagId], cardId, tagId",
      bundles: "id, createdAt",
      flashcards: "id, topicId, subjectId, bundleId, nextReview, createdAt",
      reviewLogs: "id, flashcardId, reviewedAt",
      studySessions: "id, subjectId, startedAt",
    });
    // v2: custom pomodoro presets (additive — existing data untouched)
    this.version(2).stores({
      pomoPresets: "id, createdAt",
    });
  }
}

export const db = new StudyMaxDB();

// Unique id generator (replaces Prisma cuid defaults)
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Legacy offline-cache helpers ────────────────────────────────
// Kept for import compatibility with the flashcards page. Dexie is
// now the primary store, so "caching" is a no-op (the data already
// lives here) and the "cached" reads just hit the primary tables.
export interface OfflineFlashcard {
  id: string;
  bundleId?: string | null;
  front: string;
  back: string;
  reviewCount: number;
  nextReview: number; // epoch ms
  isLeech: boolean;
  synced: boolean;
}

export interface OfflineBundle {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  cardCount: number;
  synced: boolean;
}

export async function cacheBundles(_bundles: OfflineBundle[]): Promise<void> {
  // no-op: bundles already live in the primary store
}

export async function cacheFlashcards(_cards: OfflineFlashcard[]): Promise<void> {
  // no-op: flashcards already live in the primary store
}

export async function getCachedBundleCards(bundleId: string) {
  return db.flashcards.where("bundleId").equals(bundleId).toArray();
}

export async function getCachedBundles() {
  return db.bundles.toArray();
}
