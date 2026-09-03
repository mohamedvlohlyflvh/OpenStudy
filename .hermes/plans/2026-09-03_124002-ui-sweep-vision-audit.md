# Full-Site Vision UI Bug Sweep — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Systematically discover every visual bug across the entire OpenStudy site using automated screenshots + Vision (native model vision / Gemini) analysis, then fix them in priority order — eliminating the "not proper" feel exposed by the Notes Study modal.

**Architecture:** Drive the site in `next dev` + Playwright/headless browser, capture every route × every theme × every breakpoint, feed each screenshot to Vision (native `vision_analyze` or Gemini `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` if `GOOGLE_API_KEY` is set). Vision returns structured bug JSON per image; aggregate into a site-wide report, triage by severity, then fix with systematic UI passes (tokens only, no ad-hoc colors). Evidence is the screenshots themselves — no fix ships without before/after proof.

**Tech Stack:** Next 16, Tailwind v4, Playwright, browser-use CLI / CDP, Hermes `vision_analyze` (native), optional Gemini REST, Dexie (local data) for seeding.

---

## Current context / assumptions

- User-reported symptom: "this design is not proper" on the Notes Study modal (`History lesson 2` screenshot). Native vision analysis (see screenshot above) confirms multiple defects (see Task 2 triage).
- App has ~11 routes: `/`, `/subjects`, `/notes`, `/bundles`, `/bundles/[id]/cards`, `/flashcards` (4 modes), `/sessions`, `/stats`, `/goals`, `/settings`, `/offline`. Each uses custom design system (`glass`, `rounded-2xl`, `border-accent`, `accent #FACC15`, `Inter + JetBrains Mono`).
- Themes: 12 themes via `data-theme` attribute (`aurora`, `midnight`, `nebula`, `matrix`, `ember`, `rosewood`, `cyberpunk`, `arctic`, `sandstone`, `mono`, `light`, `paper`). Many UI bugs only surface on light themes (invisible yellow on white, etc.).
- Previous fixes (flashcard `description`, notes study modal, topic↔bundle linking) touched behavior but not systematic visual QA — no screenshot proof was taken.
- Vision tooling: `vision_analyze` is native on this model (image was loaded successfully). `GOOGLE_API_KEY` is currently **not set** in `~/.hermes/.env` (only `GOOGLE_API_KEY=your_google_ai_studio_key_here` placeholder). Gemini fallback is optional — native vision is sufficient, but plan includes Gemini path if user supplies key.
- User explicitly expects "exhaustive visual evidence: screenshots of every page in every theme, then fix whatever the sweep exposes — not spot checks. Programmatic audit accepted as proof when vision is unavailable." (from MEMORY).

## Example defect — the screenshot you sent (Notes Study modal)

Vision analysis (native, confirmed by looking at `composer_2026-09-03_09-31-16-018_3ea10c.png`):

- **Content container is a pill** (`rounded-full`, fixed height) holding `NO CONTENT` — reads as a disabled input, not a reading surface. Should be `rounded-xl/2xl`, min-height, scrollable, with `Markdown` styling.
- **Title casing broken:** `History lesson 2` (Title Case) while whole app is `UPPERCASE TRACKING-WIDEST`. Should be `HISTORY LESSON 2` or `font-display` consistent.
- **Redundant breadcrumb + tag:** Yellow `HISTORY` pill (breadcrumb) plus isolated `HISTORY` dark pill below content — duplication, clutters hierarchy.
- **Hierarchy flat:** No icon/illustration for empty state, `NO CONTENT` left-aligned in pill, low contrast `text-muted-fg`, no CTA. Should be centered `EmptyState` with icon + `EDIT TO ADD CONTENT`.
- **Spacing gaps inconsistent:** breadcrumb→pill (tight), pill→tag (tiny), tag→divider (cramped), divider→buttons (cramped), footer line-break splits `AI IMPORT` awkwardly.
- **Modal itself:** `bg-[#0A0A0A]` on `bg-black/70` backdrop — almost invisible border; needs `border-glass-border` or `shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]` like flashcard faces. Border radius `extra-large` clashes with pill radius `full`.
- **Buttons:** `CLOSE` ghost text vs `EDIT`/`AI IMPORT` pill borders — three weights, no primary. Right-aligned but uneven padding. `CLOSE` should be `variant="ghost"` with consistent `h-11`, `EDIT` secondary, `AI IMPORT` primary or both secondary but equal.
- **Footer caption:** `STUDY MODE — READ, THEN IMPORT...` is `10px` uppercase, 60% contrast, line-break orphans `IMPORT` — should be `max-w-md mx-auto` with balanced wrap or single line.

These are exactly the class of bugs the full sweep will find site-wide.

---

## Proposed approach

1. Capture systematically, don't guess — every route × theme × viewport (mobile/desktop).
2. Vision is the reviewer — every image gets a structured JSON bug list from the model, not hand-waving.
3. Aggregate → triage → fix in passes: critical (empty states, pill-vs-card, invisible badges) first, then tokens/type, then motion.
4. No new design system — only reuse existing tokens (`--color-accent`, `--color-glass`, `rounded-2xl`, `border-2`, `text-muted-fg` etc.). Fixes must pass `next build` + `tsc`.

---

### Task 1: Stand up vision + screenshot harness

**Objective:** One command produces `/_audit/<route>/<theme>/desktop.png + mobile.png`.

**Files:**
- Create: `scripts/vision-audit/capture.mjs`
- Create: `scripts/vision-audit/vision.mjs`
- Modify: `package.json` (add script `"audit:ui": "node scripts/vision-audit/capture.mjs"`)

**Step 1: Write capture script (Playwright, local dev server)**
```mjs
// scripts/vision-audit/capture.mjs
import { chromium } from 'playwright';
const THEMES = ["aurora","midnight","nebula","matrix","ember","rosewood","cyberpunk","arctic","sandstone","mono","light","paper"];
const ROUTES = ["/","/subjects","/notes","/bundles","/flashcards","/flashcards?bundle=demo","/sessions","/stats","/goals","/settings"];
// 1. start `next dev` on 3000 if not running
// 2. for each theme: localStorage.setItem("study-prefs", JSON.stringify({theme}))
// 3. goto route, wait for `[data-audit-ready]` or 2s, screenshot fullPage: false viewport 1280x800 + 375x812
// 4. save to .hermes/audit/2026-09-03/<theme>/<route>.png
```

**Step 2: Write vision script**
```mjs
// scripts/vision-audit/vision.mjs
// For each png: either call Hermes vision_analyze (native) via `hermes` tool or Gemini REST if GOOGLE_API_KEY set:
// POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
// Body: { contents: [{ parts: [{text: PROMPT}, {inline_data: {mime_type:"image/png", data: base64}}]}]}
// PROMPT = "You are a brutalist SaaS UI auditor. List visual bugs as JSON array {scope, severity: critical|major|minor, desc, fix}"
// Write per-image JSON to .hermes/audit/<theme>/<route>.bugs.json
```

**Step 3: Run once to verify harness**
```bash
npm run audit:ui -- --theme=aurora --route=/notes
# Expected: .hermes/audit/aurora/notes.desktop.png + .bugs.json (≥1 bug found — the pill)
```

**Step 4: Commit**
```bash
git add scripts/vision-audit/
git commit -m "chore(audit): vision harness (playwright + gemini/native)"
```

### Task 2: Full capture matrix (all routes × all themes × 2 viewports)

**Files:**
- Output: `.hermes/audit/2026-09-03_1240/<theme>/<route>.png` (132 images: 11 routes × 12 themes × 1 viewport minimum; 2 viewports = 264)

**Steps:**
1. Seed local Dexie with fixtures: 2 subjects (each 2 topics), 3 notes (one empty `NO CONTENT` like screenshot), 2 bundles (1 topic-linked, 1 free), 6 cards (with/without description+tags+mature/due/leeches) via `node scripts/seed-fixtures.mjs` (reuses `src/app/actions`).
2. Run `npm run audit:ui -- --all` (or `node scripts/vision-audit/capture.mjs --all`).
3. Verify count: `find .hermes/audit -name "*.png" | wc -l` → 132 (or 264). Any missing route = fix harness.

### Task 3: Run vision on every image → site-wide bug report

**Files:**
- Create/Update: `.hermes/audit/2026-09-03_1240/report.md`
- Create: `.hermes/audit/2026-09-03_1240/report.json`

**Steps:**
1. For each PNG, run vision.mjs (batch with concurrency 5, retry on rate limit).
2. Aggregate `*.bugs.json` → `report.json` with schema `{route, theme, viewport, bugs:[{scope, severity, desc, fix}]}`.
3. Generate `report.md` grouped by route + severity:
```md
## /notes — Study Modal (History lesson 2)
- [critical] pill content container → replace with rounded-2xl scroll surface
- [major] title casing → uppercase tracking-tight
- [minor] footer orphan → balanced wrap
```
4. Also run programmatic audit (no vision fallback): check contrast ratios (yellow on light = fail), empty states, `rounded-full` misuse, `CLOSE` vs `EDIT` hierarchy.

**Expected outcome:** ≥30 bugs, at least 5 critical (the modal pill, light-theme yellow invisibility, flashcard 3D flip on mono, bundle card `max-w-xs` truncation etc.).

### Task 4: Triage into fix batches (MoSCoW)

**Objective:** Turn 30+ findings into 3 fix PRs ordered by user pain.

**Files:**
- Update: `.hermes/audit/report.md` (add Priority section)

**Batch A — Critical (ship first, unblocks user):**
- Notes Study modal: pill → card, title casing, empty state, buttons hierarchy, footer.
- Subjects topic modal: density/spacing, double-borders, badge wrapping (from previous feature).
- Bundles `topic badge` contrast on `light`/`paper` (yellow on white invisible).

**Batch B — Major (design system consistency):**
- Global: uppercase vs Title Case drift, `rounded-full` vs `rounded-2xl` misuse, `border-2 border-border` vs `border-glass-border`, `text-muted-fg` overuse (60% contrast fail).
- Flashcards: review card dark-on-yellow description contrast, leech table `border-2` vs `glass`.
- Settings: theme picker contrast.

**Batch C — Minor / polish:**
- Spacing `gap-px bg-border` grid dividers on mobile, `group-hover` opacity on touch, focus rings, empty state illustrations.

### Task 5: Fix Batch A — Notes Study modal + immediate siblings

**Files:**
- Modify: `src/app/notes/page.tsx` (Study modal)
- Modify: `src/components/ui.tsx` (Modal primitive — ensure consistent padding, border, shadow)
- Modify: `src/app/bundles/page.tsx` (topic badge token fix for light theme)
- Verify: `src/app/subjects/page.tsx` topic modal already patched — re-check spacing

**Implementation sketch for Notes Study modal (to replace pill):**
```tsx
// Before (bug):
<div className="rounded-full border border-border bg-muted/30 p-3">NO CONTENT</div>
// After:
<div className="max-h-[55vh] overflow-y-auto rounded-2xl border-2 border-border bg-muted/10 p-6">
  {viewNote.content ? <Markdown content={viewNote.content} /> : (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-4 rounded-2xl bg-muted p-4"><StickyNote size={24} /></div>
      <p className="text-sm font-bold uppercase tracking-widest">NO CONTENT YET</p>
      <p className="mt-1 text-xs text-muted-fg">Edit this note to add study material</p>
      <Button size="sm" className="mt-4" onClick={() => openEdit(viewNote)}><Pencil size={14} /> EDIT NOTE</Button>
    </div>
  )}
</div>
// Title: <h2 className="font-display text-xl font-bold uppercase tracking-tight">{viewNote.title}</h2>
// Breadcrumb: single row, yellow pill only once
// Footer: <p className="mx-auto max-w-md text-center text-[10px] leading-relaxed text-muted-fg">...</p>
// Buttons: CLOSE (ghost) | EDIT (secondary) | AI IMPORT (primary) — equal h-11
```

**Verification:**
```bash
npm run build
node scripts/vision-audit/capture.mjs --route=/notes --theme=aurora --theme=light
# Then re-run vision on just those two images — polluted pill bug should be gone.
```

**Commit:**
```bash
git add src/app/notes/page.tsx src/components/ui.tsx src/app/bundles/page.tsx
git commit -m "fix(ui): notes study modal pill→card + light theme badges"
```

### Task 6: Fix Batch B — Design system sweep

**Files:**
- Modify: `src/app/globals.css` (if tokens missing), `src/components/ui.tsx`, `src/app/flashcards/page.tsx`, `src/app/stats/page.tsx`, `src/app/settings/page.tsx`, `src/app/page.tsx` (dashboard)

**Rules:**
- Only use tokens: `bg-bg`, `bg-muted`, `glass`, `border-border`, `border-glass-border`, `text-fg`, `text-muted-fg`, `text-accent`, `bg-accent`, `shadow-glow-accent`.
- Enforce uppercase headings (`RevealHeading` + `ScrambleSubtitle` pattern) — no Title Case.
- Replace stray `rounded-full` content surfaces with `rounded-2xl`.
- Fix yellow-on-white: `bg-accent` text must be `text-accent-fg: #0A0A0A`, never white; topic badges on light theme use `border-accent` with `text-fg` not yellow.

**Re-run vision on 3 worst routes (`/flashcards`, `/stats`, `/bundles`) to confirm majors resolved.**

### Task 7: Fix Batch C — Polish + motion + a11y

**Files:**
- Patch: spacing (`p-8 lg:p-12` consistency), empty states (icon + CTA), focus-visible rings, `hover` vs `active` on touch.

**Checks:**
- `npx tsc --noEmit` passes
- `npm run build` passes
- Lighthouse-style: tab through every modal, esc closes, focus trap intact.

### Task 8: Final proof — reshoot all themes + publish report

**Files:**
- Create: `public/audit/` or attach to PR: before/after PNG pairs for Batch A routes.

**Steps:**
1. `npm run audit:ui -- --all` again → new `.hermes/audit/2026-09-03_1400/`.
2. Diff report: `old.critical` count vs `new.critical` should be 0.
3. Publish `report.md` excerpt in PR description with screenshots (2-3 before/after).

---

## Tests / validation

- `npx tsc --noEmit` — zero errors before any commit.
- `npm run build` (Turbopack Next 16) — must succeed after each batch.
- Vision proof: at least one screenshot per route per theme after final fix shows 0 critical + ≤2 major per image (Gemini/native judge).
- Manual spot: open `/notes` empty note → modal shows centered empty state, not pill; switch to `light` theme → yellow badge still readable; open `/subjects` topic modal → no double border.

## Risks, tradeoffs, open questions

- **Vision cost/latency:** 132 images × Gemini ~2s = ~4 min. Mitigation: batch + native vision first, Gemini only for ambiguous images. If `GOOGLE_API_KEY` stays unset, use native vision + programmatic contrast check — accepted per MEMORY.
- **Flaky screenshots:** Dexie is per-browser IndexedDB — seeding must run inside `page.evaluate(() => import("@/app/actions"))` not Node. Seed via `page.evaluate` after `localStorage` theme set.
- **Over-fixing:** Don't redesign the product — only fix "not proper" violations (pill, casing, contrast). Keep acid yellow `#FACC15`, `Inter + JetBrains Mono`, brutalist grid (`gap-px bg-border`).
- **Open Q:** User wants all bugs "then tell me" — do we present `report.md` first and wait for approval before Batch A? Plan: **yes** — after Task 3, paste full bug list and ask user to confirm priority before coding fixes.
- **Open Q:** Should we wire `GOOGLE_API_KEY` from user input? If user pastes a key, store to `.env` and re-run Gemini — plan includes step to detect `GOOGLE_API_KEY` and prefer it over native.

