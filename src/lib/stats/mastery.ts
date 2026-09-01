import type {
  BundleRec,
  FlashcardRec,
  ReviewLogRec,
} from "@/lib/db";

export interface BundleMastery {
  bundleId: string;
  bundleName: string;
  bundleColor: string;
  total: number;
  /** 0..1 — fraction of reviews with quality >= 3. NaN if no reviews. */
  accuracy: number;
  dueCount: number;
  leechCount: number;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Per-bundle mastery: total cards, accuracy, currently due, leech count.
 * Sorted by accuracy ASC (weakest first) so the table surfaces
 * the bundles the user is struggling with most.
 */
export function buildBundleMastery(
  reviews: ReviewLogRec[],
  cards: FlashcardRec[],
  bundles: BundleRec[]
): BundleMastery[] {
  const now = Date.now();
  const cardByBundle = new Map<string, FlashcardRec[]>();
  for (const c of cards) {
    if (!c.bundleId) continue;
    const list = cardByBundle.get(c.bundleId) ?? [];
    list.push(c);
    cardByBundle.set(c.bundleId, list);
  }

  // For each card, count correct/total reviews
  const cardStats = new Map<string, { correct: number; total: number }>();
  for (const r of reviews) {
    const s = cardStats.get(r.flashcardId) ?? { correct: 0, total: 0 };
    s.total++;
    if ((r.quality ?? 0) >= 3) s.correct++;
    cardStats.set(r.flashcardId, s);
  }

  const result: BundleMastery[] = bundles.map((b) => {
    const list = cardByBundle.get(b.id) ?? [];
    let correct = 0;
    let total = 0;
    let dueCount = 0;
    let leechCount = 0;
    for (const c of list) {
      const s = cardStats.get(c.id);
      if (s) { correct += s.correct; total += s.total; }
      if (new Date(c.nextReview).getTime() <= now) dueCount++;
      if (c.isLeech) leechCount++;
    }
    return {
      bundleId: b.id,
      bundleName: b.name,
      bundleColor: b.color || "#FACC15",
      total: list.length,
      accuracy: total === 0 ? NaN : correct / total,
      dueCount,
      leechCount,
    };
  });

  // Sort by accuracy ASC (NaN treated as 0 — least-rehearsed first)
  result.sort((a, b) => {
    const aa = isNaN(a.accuracy) ? -1 : a.accuracy;
    const bb = isNaN(b.accuracy) ? -1 : b.accuracy;
    return aa - bb;
  });

  return result;
}

/** Top N hardest cards by accuracy ratio (min 3 reviews to qualify). */
export interface HardestCard {
  cardId: string;
  front: string;
  back: string;
  bundleId: string | null;
  bundleName: string;
  accuracy: number;
  reviewCount: number;
  isLeech: boolean;
}

export function findHardestCards(
  reviews: ReviewLogRec[],
  cards: FlashcardRec[],
  bundles: BundleRec[],
  limit: number = 20,
  minReviews: number = 3
): HardestCard[] {
  // Per-card stats
  const stats = new Map<string, { correct: number; total: number }>();
  for (const r of reviews) {
    const s = stats.get(r.flashcardId) ?? { correct: 0, total: 0 };
    s.total++;
    if ((r.quality ?? 0) >= 3) s.correct++;
    stats.set(r.flashcardId, s);
  }

  const bundleName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return bundles.find((b) => b.id === id)?.name ?? "—";
  };

  const out: HardestCard[] = [];
  for (const c of cards) {
    const s = stats.get(c.id);
    if (!s || s.total < minReviews) continue;
    out.push({
      cardId: c.id,
      front: c.front,
      back: c.back,
      bundleId: c.bundleId ?? null,
      bundleName: bundleName(c.bundleId),
      accuracy: s.correct / s.total,
      reviewCount: s.total,
      isLeech: c.isLeech,
    });
  }

  out.sort((a, b) => a.accuracy - b.accuracy || b.reviewCount - a.reviewCount);
  return out.slice(0, limit);
}
