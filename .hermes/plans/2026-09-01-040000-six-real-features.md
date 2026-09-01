# StudyMax — Roadmap: Stats, Streaks, AI Import, Bulk Ops, Reminders, Icon Picker

> **For Hermes:** This plan is **plan-only**. No code or config changes until the user approves and asks to execute. Use `subagent-driven-development` to implement task-by-task, OR execute directly when the work is mechanical.

**Goal:** Turn StudyMax from "card flipper" into a real study tracker by shipping 6 features that exploit the data already in Dexie:
1. **Daily review streak + GitHub-style heatmap** — drives daily retention
2. **Review stats page** — retention curve, hardest cards, forecast
3. **Note → flashcards AI import** — natural inverse of the bundle import
4. **Bulk-card operations in /flashcards?bundle=** — checkbox select + bulk move/tag/delete/reset
5. **Browser-notification reminder** + auto-mark study session
6. **Subject icon picker** — surface the existing `icon` field in the UI

**Order rationale:** #1+2 are the retention-changing features and share data → ship together. #3 is the natural AI extension (~1 hour after #1 lands). #4 is daily-driver UX polish. #5 is the most fragile (needs `Notification.permission` UX). #6 is the lowest-effort/highest-visibility-polish — could even slip to after #5.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Dexie 4 · Zustand 5 · Zod 4 · Tailwind v4 · `lucide-react` · `framer-motion` (already in deps) · Web Notifications API (native, no dep). **No new dependencies.**

---

## 0. Critical context (read first)

- **Most of the data exists already.** `ReviewLogRec` logs every review with `quality: number` (0-3, derived from rating). `getTodayProgress` already returns `{ minutesToday, cardsReviewedToday, streakDays }`. `getDashboardStats` returns the week + deadlines. `getLeechCards` is implemented. Bulk actions (`batchDeleteCards`, `batchTagCards`, `batchMoveCards`) exist but are only used in the review page. **This plan is mostly UI + a few new query helpers, NOT new data plumbing.**
- **Leech auto-detection works:** 5 consecutive `quality < 3` reviews flips `isLeech = true`. No need to add this; we just need to surface it.
- **Subject icons are stored** (`icon: string`) but only defaulted to `"book-open"` on create — no UI to change them. We're adding the picker.
- **Notes are rich text** (`content: string` in `NoteRec`). The note → flashcards flow will use the same AI import modal as bundles, just with a different `source`.
- **Browser notifications are blocked until user grants permission.** We'll need a clear opt-in UX — request permission from a button click, not on page load.
- **`'use client'` is in use throughout.** All new pages/components will be client components calling server-style actions. No new server-side code needed.

---

## 1. User-facing behavior

### 1.1 Feature 1 — Streak + heatmap (dashboard)

- A new section on `/` (dashboard) between the existing widgets and the goals section
- **Streak counter:** "🔥 12 day streak · 8 cards reviewed today"
- **Heatmap:** GitHub-style 7×N grid. Each square = 1 day, color intensity = cards reviewed (0=bg, 1-5=muted, 6-15=accent-soft, 16+=accent)
- Default window: last 26 weeks (half a year)
- Hover on a square shows tooltip: "Aug 12 — 18 cards"
- Click on a square does nothing (just an indicator)

### 1.2 Feature 2 — Review stats page (`/stats`)

- New route: `/stats` (replaces or augments the dashboard's analytics)
- **Retention curve:** last-30-days chart, X = days since first review, Y = % correct (quality ≥ 3). One data point per card.
- **Hardest cards table:** top 20 cards by `quality < 3` ratio. Columns: front (truncated), bundle, accuracy %, review count, "RESET" button.
- **Forecast:** 4 numbers — "due today / tomorrow / this week / this month"
- **Per-bundle mastery:** list of bundles with their accuracy and current due counts
- **Time-of-day heatmap** (optional, low priority — only if 1+2 finish with time)

### 1.3 Feature 3 — Note → flashcards

- New "AI IMPORT" button on the note card hover row in `/notes`, same `Sparkles` icon as the bundle import
- Clicking opens the **same `AiImportModal` component** with a new `kind: "note"` source
- The modal's COPY PROMPT and IMPORT flow are unchanged — only the `source` reference changes from "this bundle" to "this note"
- Imported cards need a destination bundle → modal gets a **bundle selector dropdown** (uses existing `getBundles`)
- The action: `bulkCreateFlashcardsFromNote(noteId, bundleId, cardsJson)`

### 1.4 Feature 4 — Bulk ops on manage page

- `/flashcards?bundle=...` (and `/bundles/[id]/cards`) gets a checkbox column on every row
- "Select all" header checkbox
- When ≥1 selected, a floating action bar appears at the bottom: "5 SELECTED · MOVE / TAG / DELETE / RESET PROGRESS"
- Each action opens a small modal for target selection (bundle dropdown, tag input, confirm)
- The bulk action calls the existing `batchDeleteCards` / `batchTagCards` / `batchMoveCards` actions, plus a NEW `batchResetCardProgress` action

### 1.5 Feature 5 — Notification reminder

- A "REMIND ME" button in the FocusZone component
- Clicking it: request `Notification.permission` (with explanation), then `setTimeout` based on user's choice (15min / 1h / 4h / custom)
- When the timer fires: `new Notification("Time to review", { body: "X cards due in StudyMax" })` + focus the tab
- Also: auto-create a `StudySessionRec` when a Pomodoro work phase completes (we already have `createStudySession`, just need to call it on phase-end)

### 1.6 Feature 6 — Subject icon picker

- On `/subjects` create + edit modals: an icon dropdown (curated list: `book-open, brain, calculator, atom, code, palette, music, globe, heart, star, zap, target`)
- Stored in `icon: string` (lucide-react icon name) — already supported by the schema
- The subject card already has an icon spot — wire it up to render the chosen icon

---

## 2. Proposed approach

### 2.1 File structure (additions only)

```
src/lib/stats/
├── index.ts                  # public surface
├── streak.ts                 # pure streak calc (testable)
├── heatmap.ts                # daily counts → grid cells
├── retention.ts              # review log → retention buckets
├── forecast.ts                # cards due in N days
└── mastery.ts                # per-bundle accuracy

src/components/
├── stats-heatmap.tsx         # 7×N grid component
├── stats-streak-badge.tsx    # small "🔥 N day streak" pill
├── bulk-action-bar.tsx       # floating bottom bar
├── bulk-move-modal.tsx       # target bundle picker
├── bulk-tag-modal.tsx        # tag input
├── bulk-delete-modal.tsx     # confirm
├── bulk-reset-modal.tsx      # confirm
├── subject-icon-picker.tsx   # 12-icon grid
├── note-ai-import-button.tsx # button on note card
└── notification-scheduler.tsx # hidden helper for Feature 5
```

New routes:
- `src/app/stats/page.tsx` (Feature 2)

### 2.2 No data model changes

Everything we need is already in Dexie. The new code is:
- Query helpers (pure functions, easy to unit-test)
- React components for the UI
- 1 new action: `batchResetCardProgress`
- 1 modified action: `bulkCreateFlashcards` to accept a `noteId` source option, OR keep it simple and add `bulkCreateFlashcardsFromNote(noteId, bundleId, cardsJson)`

---

## 3. Step-by-step plan

> Tasks are 2-5 minutes each. Commit after every task. Use `subagent-driven-development` to dispatch implementers per task, OR execute directly when mechanical.

---

### Phase A — Stats foundation (Data + helpers)

**Goal:** Pure TypeScript helpers in `src/lib/stats/` that are unit-testable. No UI yet.

#### Task 1: `src/lib/stats/streak.ts` — streak calculation

```ts
import type { ReviewLogRec } from "@/lib/db";

/**
 * Compute the current study streak in days. A day "counts" if at least
 * one review happened in it. Today always counts if there's a review today;
 * otherwise the streak is "as of yesterday" (we don't break the streak
 * until midnight of the next day with no review).
 */
export function computeStreak(reviews: ReviewLogRec[], now: Date = new Date()): number {
  if (reviews.length === 0) return 0;
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const activeDays = new Set(reviews.map((r) => dayKey(new Date(r.reviewedAt))));
  let streak = 0;
  const cursor = new Date(now);
  if (!activeDays.has(dayKey(cursor))) {
    // No review today yet — check if streak still alive (yesterday)
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
```

Commit: `feat(stats): streak calculation helper`

#### Task 2: `src/lib/stats/heatmap.ts` — daily counts grid

```ts
import type { ReviewLogRec } from "@/lib/db";

export interface HeatmapDay {
  date: Date;     // midnight local
  count: number;
}

export interface HeatmapCell extends HeatmapDay {
  intensity: 0 | 1 | 2 | 3;  // 0=none, 1=1-5, 2=6-15, 3=16+
}

/** Build a grid of HeatmapCells for the last N weeks (default 26). */
export function buildHeatmap(reviews: ReviewLogRec[], weeks = 26): HeatmapCell[] {
  const now = new Date();
  // Snap to last Saturday so columns are Sun-Sat
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - end.getDay() - 1); // last Saturday
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.reviewedAt);
    d.setHours(0, 0, 0, 0);
    const k = d.toISOString().slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const cells: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    const count = counts.get(k) ?? 0;
    const intensity: 0 | 1 | 2 | 3 =
      count === 0 ? 0 : count <= 5 ? 1 : count <= 15 ? 2 : 3;
    cells.push({ date: d, count, intensity });
  }
  return cells;
}
```

Commit: `feat(stats): heatmap grid helper`

#### Task 3: `src/lib/stats/retention.ts` + `forecast.ts` + `mastery.ts`

Three small pure-function files in one commit. Each takes Dexie record arrays and returns derived stats.

```ts
// retention.ts
export interface RetentionPoint { daysSinceFirstReview: number; accuracy: number; sampleSize: number; }
export function buildRetentionCurve(reviews: ReviewLogRec[]): RetentionPoint[] {
  // Bucket cards by (daysSinceFirstReview, correct/incorrect)
  // Return one point per bucket, accuracy = correct / total
  // Days 0, 1, 3, 7, 14, 30, 60, 90 (log-spaced)
}

// forecast.ts
export function forecastDue(cards: FlashcardRec[], from: Date = new Date()): {
  dueToday: number; dueTomorrow: number; dueThisWeek: number; dueThisMonth: number;
} {
  // nextReview in (from, from+1d], etc.
}

// mastery.ts
export interface BundleMastery { bundleId: string; bundleName: string; total: number; accuracy: number; dueCount: number; leechCount: number; }
export function buildBundleMastery(reviews: ReviewLogRec[], cards: FlashcardRec[], bundles: BundleRec[]): BundleMastery[]
```

Commit: `feat(stats): retention, forecast, mastery helpers`

#### Task 4: `src/lib/stats/index.ts` — barrel export

```ts
export * from "./streak";
export * from "./heatmap";
export * from "./retention";
export * from "./forecast";
export * from "./mastery";
```

Commit: `feat(stats): barrel export`

---

### Phase B — Heatmap UI (the retention driver)

#### Task 5: `src/components/stats-heatmap.tsx`

Client component. Renders the 7-row × N-col grid using project tokens (bg / bg-muted / accent-soft / accent). Tooltip on hover (use native `title` attribute or a small custom popover — keep simple, `title=` is fine for v1).

```tsx
"use client";
import { buildHeatmap, type HeatmapCell } from "@/lib/stats";

export function StatsHeatmap({ reviews, weeks = 26 }: { reviews: ReviewLogRec[]; weeks?: number }) {
  const cells = useMemo(() => buildHeatmap(reviews, weeks), [reviews, weeks]);
  // Group cells by week (column-major)
  const columns: HeatmapCell[][] = [];
  for (let c = 0; c < weeks; c++) columns.push(cells.slice(c * 7, c * 7 + 7));
  return (
    <div className="flex gap-1 overflow-x-auto" aria-label="Review heatmap">
      {columns.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((d, j) => (
            <div key={j} title={`${d.date.toDateString()} — ${d.count} card${d.count === 1 ? "" : "s"}`}
                 className={cn("h-3 w-3 rounded-sm", [
                   d.intensity === 0 && "bg-muted",
                   d.intensity === 1 && "bg-accent/20",
                   d.intensity === 2 && "bg-accent/50",
                   d.intensity === 3 && "bg-accent",
                 ][d.intensity])} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

Commit: `feat(stats): heatmap UI component`

#### Task 6: `src/components/stats-streak-badge.tsx`

```tsx
"use client";
import { Flame } from "lucide-react";
import { computeStreak } from "@/lib/stats";
import type { ReviewLogRec } from "@/lib/db";

export function StatsStreakBadge({ reviews }: { reviews: ReviewLogRec[] }) {
  const streak = computeStreak(reviews);
  if (streak === 0) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5">
      <Flame size={14} className="text-accent" />
      <span className="font-mono text-xs font-bold uppercase tracking-widest text-accent-fg">
        {streak} DAY STREAK
      </span>
    </div>
  );
}
```

Commit: `feat(stats): streak badge component`

#### Task 7: Wire into dashboard

Read `src/app/page.tsx`, find a sensible insertion point (probably after the existing widgets, before the goals section), add a new section that:
- Calls `getTodayProgress()` + reads review logs via a new `getAllReviewLogs()` action (or expose via the existing `getDashboardStats`)
- Renders `<StatsStreakBadge reviews={...} />` + `<StatsHeatmap reviews={...} />`

Add `getAllReviewLogs()` to actions.ts (simple wrapper: `return db.reviewLogs.toArray()`).

Commit: `feat(dashboard): streak badge + heatmap section`

---

### Phase C — Stats page

#### Task 8: `src/app/stats/page.tsx` shell

Create the new route with a layout placeholder. Renders: page title, "RETENTION CURVE" placeholder, "HARDEST CARDS" placeholder, "FORECAST" placeholder, "PER-BUNDLE MASTERY" placeholder. All placeholders for now — filled in next tasks.

Add to `src/app/sidebar.tsx` a nav link to `/stats` (icon: `BarChart3` from lucide).

Commit: `feat(stats): new /stats route + sidebar link`

#### Task 9: Retention curve chart

In `/stats`, fetch all reviews + cards, compute `buildRetentionCurve`, render with `framer-motion` (already a dep) — simple SVG line chart, no recharts dependency. 100 lines max.

Commit: `feat(stats): retention curve chart`

#### Task 10: Hardest cards table

In `/stats`, fetch all cards + reviews, compute hardest by accuracy ratio (min 3 reviews). Render a table with columns: front, bundle, accuracy, review count, RESET button. RESET opens a small confirm modal that calls new action `batchResetCardProgress(ids)`.

Add `batchResetCardProgress(ids: string[])` to actions.ts:
```ts
export async function batchResetCardProgress(ids: string[]): Promise<number> {
  const now = new Date();
  await db.flashcards.where("id").anyOf(ids).modify({
    easeFactor: 2.5, intervalDays: 1, nextReview: now,
    consecutiveAgain: 0, isLeech: false, updatedAt: now,
  });
  return ids.length;
}
```

Commit: `feat(stats): hardest cards table + batchResetCardProgress action`

#### Task 11: Forecast widget + per-bundle mastery

Two small cards side by side. Forecast uses `forecastDue(cards)`. Mastery uses `buildBundleMastery(reviews, cards, bundles)`.

Commit: `feat(stats): forecast + per-bundle mastery`

---

### Phase D — Note → AI import

#### Task 12: `bulkCreateFlashcardsFromNote` action

```ts
export async function bulkCreateFlashcardsFromNote(
  noteId: string, bundleId: string, cardsJson: string
): Promise<{ ok: boolean; created: number; error?: string }> {
  const note = await db.notes.get(noteId);
  if (!note) return { ok: false, created: 0, error: "Note not found." };
  return bulkCreateFlashcards(bundleId, cardsJson);
}
```

Commit: `feat(ai-import): bulkCreateFlashcardsFromNote action`

#### Task 13: Extend `AiImportModal` to accept `kind: "bundle" | "note"` + bundle picker

In `src/components/ai-import-modal.tsx`, add props:
- `kind: "bundle" | "note"`
- `sourceId: string` (the bundle or note id)
- `availableBundles: Bundle[]` (for the picker)
- If `kind === "note"`, show a `<select>` of bundles near the COPY PROMPT button

When `kind === "note"`, the import button calls the new `bulkCreateFlashcardsFromNote` action.

Commit: `feat(ai-import): modal supports note source with bundle picker`

#### Task 14: `NoteAiImportButton` component + wire into `/notes`

Tiny wrapper component. Wire into `src/app/notes/page.tsx` hover row, next to existing Edit/Pin/Delete actions.

Commit: `feat(notes): AI IMPORT button on note cards`

---

### Phase E — Bulk ops

#### Task 15: Checkbox column on manage page

In `src/app/flashcards/page.tsx` (the manage-cards view), add a `selected: Set<string>` state. Add a checkbox in the table header + a checkbox per row. Style with `accent-accent` (Tailwind v4 supports the `accent-*` utility).

Commit: `feat(flashcards): checkbox column for bulk selection`

#### Task 16: Floating `BulkActionBar`

Component renders fixed at bottom-center when ≥1 selected. Four buttons: MOVE, TAG, DELETE, RESET. Each opens a small modal. The bar also shows "5 SELECTED · CANCEL".

Commit: `feat(flashcards): floating bulk action bar`

#### Task 17: Bulk move / tag / delete / reset modals

Four small modals. Each does the obvious thing (target select, tag input, confirm). Re-use `Modal` primitive from `src/components/ui.tsx`.

Commit: `feat(flashcards): bulk move/tag/delete/reset modals`

---

### Phase F — Notification reminder

#### Task 18: `useNotificationScheduler` hook

A client hook that:
- Holds a `setTimeout` handle in a ref
- Exposes `requestPermission()` and `schedule(when: Date, message: string)`
- On `schedule`: if no permission, requests it; if granted, sets a timeout that fires the notification + focuses the tab
- Cleanup on unmount

```ts
"use client";
import { useEffect, useRef } from "react";

export function useNotificationScheduler() {
  const handleRef = useRef<number | null>(null);
  useEffect(() => () => { if (handleRef.current) clearTimeout(handleRef.current); }, []);
  const requestPermission = async (): Promise<NotificationPermission> => {
    if (typeof Notification === "undefined") return "denied";
    if (Notification.permission === "granted") return "granted";
    return await Notification.requestPermission();
  };
  const schedule = (when: Date, title: string, body: string) => {
    if (handleRef.current) clearTimeout(handleRef.current);
    const ms = Math.max(0, when.getTime() - Date.now());
    handleRef.current = window.setTimeout(() => {
      if (Notification.permission === "granted") {
        const n = new Notification(title, { body, icon: "/icon-192.png" });
        n.onclick = () => window.focus();
      }
    }, ms);
  };
  return { requestPermission, schedule };
}
```

Commit: `feat(notifications): useNotificationScheduler hook`

#### Task 19: "REMIND ME" button in FocusZone

In `src/components/focus-zone.tsx`, add a small "REMIND ME" button. On click, show a tiny popover with preset options (15m / 1h / 4h / custom minutes). Confirm → call `schedule(when, ...)`. Also auto-call `createStudySession` on work-phase completion (already exposed).

Commit: `feat(focus-zone): reminder button + auto session logging`

---

### Phase G — Icon picker

#### Task 20: `src/components/subject-icon-picker.tsx`

12 icons in a 4×3 grid. Selected = ring + accent bg. Curated lucide names. Click to select.

```tsx
"use client";
import { BookOpen, Brain, Calculator, Atom, Code, Palette, Music, Globe, Heart, Star, Zap, Target } from "lucide-react";
const ICONS = { "book-open": BookOpen, brain: Brain, calculator: Calculator, atom: Atom, code: Code, palette: Palette, music: Music, globe: Globe, heart: Heart, star: Star, zap: Zap, target: Target };
const NAMES = Object.keys(ICONS) as (keyof typeof ICONS)[];
```

Commit: `feat(subjects): icon picker component`

#### Task 21: Wire into create + edit subject modals

In `src/app/subjects/page.tsx`, add `<SubjectIconPicker value={newIcon} onChange={setNewIcon} />` to both modals. Pass the chosen icon to `createSubject` / `updateSubject` (their schemas already accept `icon` per `subjectSchema`).

Render the chosen icon on the subject card (replace the hardcoded `BookOpen`).

Commit: `feat(subjects): wire icon picker into create/edit + card display`

---

### Phase H — Documentation

#### Task 22: Update README

Add the 6 features to the Features table in `README.md`:
- Streak + heatmap
- Review stats (`/stats`)
- Note → AI flashcards
- Bulk card operations
- Browser-notification reminder
- Subject icons

Commit: `docs: document 6 new features`

---

## 4. Files likely to change

| Action | Path |
|---|---|
| Create | `src/lib/stats/{index,streak,heatmap,retention,forecast,mastery}.ts` |
| Create | `src/components/stats-heatmap.tsx` |
| Create | `src/components/stats-streak-badge.tsx` |
| Create | `src/app/stats/page.tsx` |
| Create | `src/components/note-ai-import-button.tsx` |
| Create | `src/components/bulk-{action-bar,move-modal,tag-modal,delete-modal,reset-modal}.tsx` |
| Create | `src/components/subject-icon-picker.tsx` |
| Create | `src/hooks/useNotificationScheduler.ts` |
| Modify | `src/app/actions.ts` (add: `getAllReviewLogs`, `batchResetCardProgress`, `bulkCreateFlashcardsFromNote`) |
| Modify | `src/app/page.tsx` (dashboard — add heatmap + streak section) |
| Modify | `src/app/components/ai-import-modal.tsx` (support `kind: "note"` + bundle picker) |
| Modify | `src/app/notes/page.tsx` (wire NoteAiImportButton) |
| Modify | `src/app/flashcards/page.tsx` (checkbox column + bulk bar) |
| Modify | `src/app/subjects/page.tsx` (icon picker in modals + card display) |
| Modify | `src/components/focus-zone.tsx` (reminder button + auto session) |
| Modify | `src/components/sidebar.tsx` (link to /stats) |
| Modify | `README.md` |

**Not touched:** `src/lib/db.ts` (no schema changes), `src/lib/store.ts` (no state changes), any new dependencies, any `.env` files.

---

## 5. Tests / validation

- **Pure helpers** in `src/lib/stats/` are unit-testable. Smoke them with the same pattern as the NotebookLM smoke test (`npx tsx scripts/_smoke-stats.ts`, ~20 assertions, all pass). Run before each commit.
- **tsc --noEmit** clean after every task
- **next build** green at the end of each phase
- **Manual smoke checklist** (programmatic, via curl on dev server):
  - `/stats` returns 200 and includes the new content
  - Dashboard's HTML contains the streak badge markup
  - `/notes` includes the AI IMPORT button on hover
  - `/flashcards?bundle=...` includes the checkbox column

---

## 6. Risks, tradeoffs, and open questions

### 6.1 Time-of-day heatmap (Feature 2 sub-item)
Listed as "optional, low priority" in §1.2. **Decision:** drop it. Per-day heatmap + retention curve already tell the same story with less UI. If we have time at the end, add it; otherwise skip.

### 6.2 Notification timing accuracy
Browsers throttle background `setTimeout` aggressively. If the user switches tabs or minimizes the window, the reminder may fire late (or not at all if the OS suspends the tab). **Mitigation:** show a clear in-tab countdown ("Reminding in 14:23") so the user knows it's pending. Add a note in the UI that notifications only fire when the tab is open.

### 6.3 Bulk action bar floating vs. inline
A floating bar at the bottom of the viewport is the standard pattern (Gmail, Linear, Notion). It works well but covers content. **Decision:** go with floating; add a backdrop-blur so the content underneath is faintly visible. Dismiss on `Cancel` or when all checkboxes uncheck.

### 6.4 Note → bundle picker UX
When a user clicks "AI IMPORT" on a note, the modal needs to ask "which bundle?". Two options:
- (A) Show bundle picker in the modal
- (B) Add a "create new bundle from this note" shortcut

Going with (A) only. (B) is nice but adds complexity. The bundle picker can be a `<select>` populated from `getBundles()`.

### 6.5 Icon picker scope
The 12 curated icons are deliberately small. A future v1.1 could expose a full lucide catalog. For now, hardcoding the 12 is the right tradeoff — bounded set prevents decision paralysis and keeps the UI grid tight.

### 6.6 Streak data granularity
The existing `getTodayProgress` counts `StudySessionRec` for active days, not `ReviewLogRec`. **This is a bug for our use case** — a user who reviews 100 cards without starting a "session" still has a streak, but the current code wouldn't count it. **Fix:** in Task 7, change `getTodayProgress` to use `ReviewLogRec` for `activeDays` (or just inline the streak calc using the new `computeStreak` helper which already does this correctly). The minutesToday metric still comes from sessions.

### 6.7 Charting library decision
No charting library is installed. The retention curve is a simple SVG line chart — I'll hand-roll it with `framer-motion` for the entrance animation. **No recharts/chartjs dependency** (keeps bundle small and respects offline-first — no CDN deps).

### 6.8 Card-selector performance
With 1000+ cards, the `Set<string>` selection state is fine. Re-render is keyed by card id, so only changed rows re-render. The bulk action server calls are batched in `where().anyOf()` which is a single Dexie transaction.

---

## 7. Out of scope (explicit non-goals)

- ❌ **Card difficulty rating → auto-promote/demote** (was #8 in the discussion) — the leech flag already does this implicitly
- ❌ **Global ⌘K search** (was #7) — defer; the heatmap is the higher-leverage feature
- ❌ **Theme migration for bundles/manage pages** (was #9) — defer; not on the user's ask
- ❌ **Sharable bundle URLs** (was #10) — defer; no clear demand signal
- ❌ **Subject ↔ Bundle relationship** — still not modeled; the note → cards flow can land in any bundle
- ❌ **Soundscape WIP** — unrelated

---

## 8. Execution handoff

When the user approves this plan, the recommended execution path is:

1. **`subagent-driven-development`** skill — dispatch a fresh `delegate_task` per task, two-stage review per task (spec compliance → code quality). For pure-helper tasks (1-4) where the spec is the code, mechanical execution is fine. For UI tasks (5-21) where visual judgment matters, prefer review-heavy.

2. **Phasing:** ship Phase A (helpers) first as a single commit batch with smoke tests. Then Phase B (heatmap UI) lands a visible feature. Then Phase C (stats page) is the second big visible feature. Then Phases D-G are smaller. Then H (docs).

3. **Estimated total time:** 18-25 hours of focused work across 22 tasks. Can be parallelized but UI tasks should land sequentially to avoid merge conflicts on shared files.

4. **Defer the subagent approach if the local environment can't support it** (as we saw with the NotebookLM plan). Direct execution is fine for the helper tasks; UI tasks benefit from subagent review even if the agent just runs the steps.

**Either way: do not start coding until the user types "go" (or equivalent).**
