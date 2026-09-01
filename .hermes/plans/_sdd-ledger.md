# SDD ledger — plan: .hermes/plans/2026-08-30_223000-notebooklm-integration.md

> **Branch:** `feature/notebooklm` ✅ pushed to `origin/feature/notebooklm`
> **BASE:** `36937a7` (`wip: soundscape feature for focus zone (in progress)`)
> **HEAD:** `fa2f95d` (`docs: document NotebookLM integration`)
> **Diff:** 18 files, +651 / −24

## All tasks complete

| # | Title | Commit | Result |
|---|---|---|---|
| 1 | Zod schemas | `7bea7e3` | ✅ |
| 2 | Public re-exports | `65da7ee` | ✅ |
| 3 | Format builder | `b467d14` | ✅ |
| 4 | Source builders | `1b977c0` | ✅ |
| 5a | Transport interface | `4136a33` | ✅ |
| 5b | `file-download` transport | `f8f362e` | ✅ |
| 6  | `share-link` transport (placeholder) | `8dac96a` | ✅ |
| 7  | Client factory | `65da7ee` (bundled w/ #2) | ✅ |
| 8  | Dexie v4 schema | `b41d6b0` | ✅ |
| 9  | Store: `notebookShareLinkEnabled` | `a2f8143` (amended — fixed `loadPrefs` type) | ✅ |
| 6.5 | Wire store flag into share-link | `43d3032` | ✅ |
| 10 | Actions | `b63c90c` (amended — fixed `import type` → runtime import for Zod schema) | ✅ |
| 11+12 | Button + Modal | `af0be26` | ✅ |
| 13 | `/bundles` wiring | `d9826e7` | ✅ |
| 14 | `/subjects` wiring | `3ff7447` | ✅ |
| 15 | Settings section + recent exports | `7e110a5` | ✅ |
| 16 | tsc + lint | (no commit) | ✅ 0 new errors, 0 new warnings |
| 17 | `next build` | (no commit) | ✅ 13 routes, 9.1s compile |
| 18 | Manual smoke | (10/10 checks pass) | ✅ |
| 19 | README row | `fa2f95d` | ✅ |
| 20 | Push | branch live on `origin/feature/notebooklm` | ✅ |

## Rulings I made

- **RULING #3 (Task 9 before Tasks 6+15; 6.5 patch exists):** Executed in order. The 6.5 patch landed between Task 9 (store flag) and Task 10 (actions), with `isAvailable()` reading the store.
- **RULING (load-bearing): loadPrefs type annotation must include new field.** First commit of Task 9 left a TS error because `function loadPrefs(): Partial<Pick<AppState, "theme" | "reducedMotion" | "sidebarOpen">>` didn't include the new `notebookShareLinkEnabled`. Fixed and amended the same commit. Caught by `tsc` immediately — exactly what it's for.
- **RULING (load-bearing): `NotebookSourceInput` is a Zod schema, not a type-only import.** First commit of Task 10 left a TS error because I imported it with `import type`. Zod schemas must be imported as values. Fixed and amended. Caught by `tsc` immediately.
- **RULING (deferred): Subject↔Bundle link is OUT of v1.** Per plan §6.1, this would require a Dexie v5 schema change. Deferred to a follow-up plan. The current `buildSubjectSource` returns topics+notes+all-cards (filters by topic for notes; does not filter bundles because the link doesn't exist).
- **RULING (deferred): `next lint` command in Task 16** ran but Next 16's CLI has changed — it now wants a directory arg. The actual lint check was done via `npx eslint .` directly, which is what the project uses. 0 new errors, 23 pre-existing warnings (none in our new files).

## Lessons

- **Subagents time out fast on Windows.** 600s is the ceiling; 5 file-writes + 5 commits + 5 `tsc` runs is ~10min of wall time when a subagent uses git-stash to isolate per-file commits. Either dispatch smaller batches (1-2 files) or execute directly.
- **Always run `tsc` after committing.** Both the type-annotation bug (Task 9) and the import-type bug (Task 10) were caught the moment I ran `tsc` post-commit. The plan's "tsc after every commit" rule paid for itself twice in this run.
- **Direct execution was the right call.** After the first subagent timeout, doing Tasks 8-15 myself took ~15 minutes total. Faster than dispatching again and waiting.

## What ships

- `src/lib/notebooklm/` — 7 new files (schema, format, sources, client, 3 transports)
- `src/components/notebook-lab-button.tsx` — 25 lines
- `src/components/notebook-lab-modal.tsx` — 169 lines
- `src/components/recent-exports-list.tsx` — 75 lines
- `src/lib/db.ts` — +8 lines (v4 migration, 2 table declarations, 1 type import)
- `src/lib/store.ts` — +14 lines (`notebookShareLinkEnabled` field, setter, hydrate, `loadPrefs` type fix)
- `src/app/actions.ts` — +71 lines (4 new exports: `sendToNotebookLM`, `getRecentNotebookExports`, `redownloadNotebookExport`, `getNotebookSettings`)
- `src/app/bundles/page.tsx` — replaced 22-line inline NotebookLM hack with 5-line `NotebookLabButton`
- `src/app/subjects/page.tsx` — added NotebookLabButton to subject card actions
- `src/app/settings/page.tsx` — added NOTEBOOK LAB section + share-link toggle + recent exports list
- `README.md` — feature row added

**Zero new dependencies. Zero new env vars. Zero network calls unless share-link toggle is ON.**

## Rulings to surface to user (final list)

1. **RULING #3** — Task 9 → 6.5 → Task 10 ordering. Executed cleanly.
2. **loadPrefs type fix** — `loadPrefs()` Pick type was missing the new field. Amended Task 9's commit.
3. **`import type` fix** — `NotebookSourceInput` is a Zod value, not a type. Amended Task 10's commit.
4. **Subject↔Bundle link** — deferred to follow-up per plan §6.1.
5. **Next 16 `next lint`** — the script's CLI shape changed; ran `npx eslint .` directly. No findings.
