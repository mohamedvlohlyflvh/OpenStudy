// ─── Review-queue ordering helpers ────────────────────────────────
// Single source of truth for "which cards are served now, in what order".
// Used by the flashcards page loaders; unit-tested in review-queue.test.ts.

export interface DueDateLike {
  nextReview: Date | string | number;
}

/** True when the card's review is due at (or before) `now`. */
export function isDueCard<T extends DueDateLike>(card: T, now: number = Date.now()): boolean {
  return new Date(card.nextReview).getTime() <= now;
}

/** Most-overdue-first comparator for the review queue. */
export function byDueDateAsc<T extends DueDateLike>(a: T, b: T): number {
  return new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime();
}

/** Keep only due cards, most-overdue-first. */
export function filterDueCards<T extends DueDateLike>(cards: T[], now: number = Date.now()): T[] {
  return cards.filter((c) => isDueCard(c, now)).sort(byDueDateAsc);
}
