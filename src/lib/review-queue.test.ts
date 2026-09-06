import { describe, it, expect } from "vitest";
import { isDueCard, byDueDateAsc, filterDueCards } from "@/lib/review-queue";

const NOW = new Date("2026-09-07T12:00:00Z").getTime();
const card = (nextReview: string | Date | number) => ({ nextReview });

describe("isDueCard", () => {
  it("treats past and exactly-now reviews as due", () => {
    expect(isDueCard(card("2026-09-01T00:00:00Z"), NOW)).toBe(true);
    expect(isDueCard(card(NOW), NOW)).toBe(true);
  });

  it("treats future reviews (+30d regression case) as not due", () => {
    expect(isDueCard(card("2026-10-07T12:00:00Z"), NOW)).toBe(false);
    expect(isDueCard(card(NOW + 1), NOW)).toBe(false);
  });

  it("accepts Date and epoch-ms shapes", () => {
    expect(isDueCard(card(new Date(NOW - 1000)), NOW)).toBe(true);
    expect(isDueCard(card(NOW + 1000), NOW)).toBe(false);
  });
});

describe("filterDueCards", () => {
  it("drops non-due cards and sorts most-overdue-first", () => {
    const dueLate = card("2026-09-06T12:00:00Z");
    const dueEarly = card("2026-09-01T12:00:00Z");
    const future = card("2026-10-07T12:00:00Z");
    // input in newest-first (management) order, like getBundleCards
    const out = filterDueCards([future, dueLate, dueEarly], NOW);
    expect(out).toEqual([dueEarly, dueLate]);
  });

  it("returns [] for an empty or all-future queue", () => {
    expect(filterDueCards([], NOW)).toEqual([]);
    expect(filterDueCards([card("2027-01-01T00:00:00Z")], NOW)).toEqual([]);
  });
});

describe("byDueDateAsc", () => {
  it("orders earliest nextReview first", () => {
    const a = card("2026-09-05T00:00:00Z");
    const b = card("2026-09-02T00:00:00Z");
    expect([a, b].sort(byDueDateAsc)).toEqual([b, a]);
  });
});
