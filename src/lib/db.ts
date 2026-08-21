import Dexie, { type Table } from "dexie";

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

export interface OfflineReview {
  id?: number;
  flashcardId: string;
  quality: number;
  reviewedAt: number; // epoch ms
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

class StudyDB extends Dexie {
  flashcards!: Table<OfflineFlashcard, string>;
  reviews!: Table<OfflineReview, number>;
  bundles!: Table<OfflineBundle, string>;

  constructor() {
    super("study-offline");
    this.version(1).stores({
      flashcards: "id, bundleId, nextReview, synced",
      reviews: "++id, flashcardId, synced",
      bundles: "id, synced",
    });
  }
}

export const db = new StudyDB();

// ─── Offline helpers ────────────────────────────────────────────
export async function cacheBundles(bundles: OfflineBundle[]) {
  await db.bundles.bulkPut(bundles);
}

export async function cacheFlashcards(cards: OfflineFlashcard[]) {
  if (cards.length === 0) return;
  await db.flashcards.bulkPut(cards);
}

export async function getCachedBundleCards(bundleId: string) {
  return db.flashcards.where("bundleId").equals(bundleId).toArray();
}

export async function getCachedBundles() {
  return db.bundles.toArray();
}

export async function queueReview(flashcardId: string, quality: number) {
  await db.reviews.add({
    flashcardId,
    quality,
    reviewedAt: Date.now(),
    synced: false,
  });
}

export async function getPendingReviews() {
  return db.reviews.where("synced").equals(0).toArray();
}

export async function markReviewSynced(id: number) {
  await db.reviews.update(id, { synced: true });
}

// Apply a local review result to cached card (optimistic SM-2-lite)
export async function applyLocalReview(flashcardId: string, quality: number) {
  const card = await db.flashcards.get(flashcardId);
  if (!card) return;
  const interval = quality < 3 ? 1 : Math.min(card.reviewCount * 2 + 6, 365);
  await db.flashcards.update(flashcardId, {
    reviewCount: card.reviewCount + 1,
    nextReview: Date.now() + interval * 86400000,
    isLeech: quality < 3 ? card.isLeech : false,
  });
}
