import type { FlashcardRec } from "@/lib/db";

export interface ForecastResult {
  dueToday: number;
  dueTomorrow: number;
  dueThisWeek: number;
  dueThisMonth: number;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Count how many cards are due in various windows starting from `from`.
 * "Today" = nextReview within (from, endOfToday].
 * "Tomorrow" = within the day after.
 * "This week" = the next 7 days.
 * "This month" = the next 30 days.
 *
 * Counts are CUMULATIVE: a card due today is also counted in every wider
 * window. So `dueThisMonth >= dueThisWeek >= dueTomorrow >= dueToday`.
 */
export function forecastDue(
  cards: FlashcardRec[],
  from: Date = new Date()
): ForecastResult {
  const start = from.getTime();
  const endOfDayMs = (() => {
    const d = new Date(from);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const tomorrowEndMs = endOfDayMs + ONE_DAY;
  const weekEndMs = start + 7 * ONE_DAY;
  const monthEndMs = start + 30 * ONE_DAY;

  let dueToday = 0;
  let dueTomorrow = 0;
  let dueThisWeek = 0;
  let dueThisMonth = 0;

  for (const c of cards) {
    const t = new Date(c.nextReview).getTime();
    if (t > monthEndMs) continue;
    dueThisMonth++;
    if (t > weekEndMs) continue;
    dueThisWeek++;
    if (t > tomorrowEndMs) continue;
    dueTomorrow++;
    if (t > endOfDayMs) continue;
    dueToday++;
  }

  return { dueToday, dueTomorrow, dueThisWeek, dueThisMonth };
}
