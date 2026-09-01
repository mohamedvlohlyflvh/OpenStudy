import type { ReviewLogRec } from "@/lib/db";

/**
 * Compute the current study streak in days.
 *
 * Rules:
 * - A day "counts" if at least one review happened in it (local time).
 * - Today always counts if there's a review today; if not, we look at
 *   yesterday — the streak isn't broken until midnight of the next day
 *   with no review.
 * - Returns 0 if there are no reviews at all.
 *
 * Pure function — does not touch the DOM or fetch anything. Time input
 * is parameterized for testability.
 */
export function computeStreak(
  reviews: ReviewLogRec[],
  now: Date = new Date()
): number {
  if (reviews.length === 0) return 0;

  const dayKey = (d: Date): string =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const activeDays = new Set<string>();
  for (const r of reviews) {
    activeDays.add(dayKey(new Date(r.reviewedAt)));
  }

  const cursor = new Date(now);
  if (!activeDays.has(dayKey(cursor))) {
    // No review today yet — streak still alive if yesterday was active
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
