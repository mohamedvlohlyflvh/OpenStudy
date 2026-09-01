import type { ReviewLogRec } from "@/lib/db";

export interface HeatmapDay {
  /** Midnight, local time. */
  date: Date;
  count: number;
}

/** 0 = none, 1 = 1-5, 2 = 6-15, 3 = 16+ */
export type HeatmapIntensity = 0 | 1 | 2 | 3;

export interface HeatmapCell extends HeatmapDay {
  intensity: HeatmapIntensity;
}

/** Build a column-major grid of `weeks * 7` cells ending on the last Saturday. */
export function buildHeatmap(
  reviews: ReviewLogRec[],
  weeks: number = 26
): HeatmapCell[] {
  // Snap end to the *upcoming* Saturday so the grid includes today and
  // runs to the end of this week. Columns are still Sun (row 0) → Sat
  // (row 6).
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  // 6 = Saturday in getDay() (Sun=0..Sat=6). Days until next Saturday:
  //   Sun→6, Mon→5, ..., Fri→1, Sat→0. But we want the *current week's*
  // Saturday (or today if today IS Saturday), not the next one.
  // Day index in week: Sun=0, Mon=1, ..., Sat=6.
  // We want end to land on: today (if Sat) or today's week's Saturday.
  // Today's week's Saturday offset = 6 - today.getDay() (always >=0).
  end.setDate(end.getDate() + (6 - end.getDay()));

  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);

  const counts = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.reviewedAt);
    d.setHours(0, 0, 0, 0);
    // Local-date key (YYYY-MM-DD) to avoid timezone drift between
    // local midnight and UTC midnight.
    const k = localDateKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const cells: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = localDateKey(d);
    const count = counts.get(k) ?? 0;
    const intensity: HeatmapIntensity =
      count === 0 ? 0 : count <= 5 ? 1 : count <= 15 ? 2 : 3;
    cells.push({ date: d, count, intensity });
  }
  return cells;
}

/** Local-time YYYY-MM-DD key (not UTC, which would shift at midnight). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Group cells into columns of 7 (one column per week, Sun→Sat top→bottom). */
export function groupHeatmapByWeek(cells: HeatmapCell[]): HeatmapCell[][] {
  const cols: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    cols.push(cells.slice(i, i + 7));
  }
  return cols;
}
