# Topics → Bundles Integration — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make Topics inside `/subjects` truly usable — pick a Topic and instantly create / link / manage a flashcard Bundle for that Topic, with bidirectional navigation and stats.

**Architecture:** Keep Dexie as sole source of truth. Add an optional `topicId` (+ `subjectId` denormalized) to `BundleRec` so a Bundle can be *owned* by a Topic, but remain usable anywhere. Existing bundles (`topicId = null`) stay valid. Cards already support `topicId` + `bundleId` together; we will dual-link when a Bundle was created from a Topic so both views see the same cards. No data loss, additive Dexie version bump.

**Tech Stack:** Next 16 + React 19, Dexie 4, TypeScript, Tailwind v4, Zustand (no new deps).

---

## Current context / assumptions

- `Subject 1—* Topic` (via `db.topics.subjectId`). `Bundle` currently has *no* topic link. `FlashcardRec` has nullable `topicId` + `bundleId` + `subjectId`.
- Topics are CRUD only inside a modal on `/subjects` (`src/app/subjects/page.tsx:34-397`). No counts, no navigation, no bundle actions — dead end.
- Bundles (`/bundles`) are independent decks. Flashcards review (`/flashcards`) filters by bundle only. Subjects page counts show `topics` / `flashcards` / `sessions` but topics modal shows just names.
- User request: "Make the topics in Subject page usable so I can make a bundle of cards about a specific topic and so on" — i.e. Topics should be the organizer, Bundles the materializer.

## Proposed approach

1. **DB:** Add `topicId` + `subjectId` to `BundleRec`, Dexie v4 migration (additive indexes). Backfill: existing bundles get `null`.
2. **Actions:** `createBundleFromTopic(topicId)`, `getBundlesByTopic(topicId)`, `linkBundleToTopic(bundleId, topicId)`, extend `createBundleFlashcard`/`importCardsIntoBundle` to set `topicId` when bundle is topic-owned, extend `createBundle` to accept optional topic link, extend `getBundles` to include `topic` include.
3. **Subjects page:** Upgrade topics modal rows to show `notes× / cards×` counts + actions: `VIEW CARDS`, `VIEW NOTES`, `CREATE BUNDLE`, `LINK EXISTING`. Add `CREATE BUNDLE FROM TOPIC` inline flow (name defaults to topic name, color from subject). Show linked bundles as chips.
4. **Bundles page:** Show topic badge (`Subject › Topic`) when `bundle.topicId` set, filter/search by topic, and allow opening topic view.
5. **Bundle cards page:** When bundle is topic-linked, show breadcrumb and allow adding cards that keep `topicId` synced.
6. **Flashcards/Browse:** `bundle` include now carries `topic` so users see where a bundle came from.

---

### Task 1: Dexie schema — add Bundle topic link (backwards compatible)

**Objective:** Bundles can optionally belong to a Topic without breaking existing data.

**Files:**
- Modify: `src/lib/db.ts:61-68, 169-193`

**Step 1: Write failing test (Dexie in-memory)**
```ts
// tests/db-bundle-topic.test.ts (or manual script)
import { db } from "@/lib/db";
test("bundle stores topicId", async () => {
  const bundle = await db.bundles.add({ id: "b1", name: "T", topicId: "t1", subjectId: "s1", color: "#fff", createdAt: new Date(), updatedAt: new Date() });
  expect((await db.bundles.get("b1"))?.topicId).toBe("t1");
});
```
Run: `npm run build` / `npx tsc --noEmit` — should fail: `Property 'topicId' does not exist on type 'BundleRec'`

**Step 2: Implement**
```ts
// src/lib/db.ts
export interface BundleRec {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  topicId?: string | null;    // NEW
  subjectId?: string | null;  // NEW (denorm for fast filter)
  createdAt: Date;
  updatedAt: Date;
}
// In OpenStudyDB constructor, bump to version 4:
this.version(4).stores({
  bundles: "id, createdAt, topicId, subjectId", // add indexes
});
// Keep v1..v3 unchanged.
```

**Step 3: Verify**
Run: `npm run build` — passes. Existing bundles load with `topicId === undefined` (treated as null). No migration data loss because new indexes are additive.

**Step 4: Commit**
```bash
git add src/lib/db.ts
git commit -m "feat(db): bundle optional topicId/subjectId link (v4)"
```

### Task 2: Validations & DB helpers for topic-linked bundles

**Objective:** Validate and expose bundle-topic operations.

**Files:**
- Modify: `src/lib/validations.ts:73-84`
- Modify: `src/app/actions.ts` (after `getBundles` block, ~657-725)

**Step 1: Failing test**
```ts
bundleSchema.parse({ name: "x", topicId: "t1" }) // should accept optional topicId
```

**Step 2: Implement validations**
```ts
// src/lib/validations.ts — extend bundleSchema
export const bundleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#DFE104"),
  topicId: z.string().min(1).optional().nullable(),
  subjectId: z.string().min(1).optional().nullable(),
});
```

**Step 3: Implement actions**
```ts
// src/app/actions.ts
async function topicIncludeForBundle(bundle: BundleRec) { /* reuse topicInclude */ }

export async function createBundleFromTopic(topicId: string, overrides?: { name?: string; color?: string }) {
  const topic = await db.topics.get(topicId);
  if (!topic) throw new Error("Topic not found");
  const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
  const name = overrides?.name?.trim() || topic.name;
  const color = overrides?.color || subject?.color || "#DFE104";
  const now = new Date();
  const bundle: BundleRec = { id: uid(), name, description: null, color, topicId, subjectId: topic.subjectId, createdAt: now, updatedAt: now };
  await db.bundles.add(bundle);
  return bundle;
}
export async function getBundlesByTopic(topicId: string) {
  const all = await db.bundles.where("topicId").equals(topicId).toArray();
  return Promise.all(all.map(async b => ({ ...b, _count: { flashcards: await db.flashcards.where("bundleId").equals(b.id).count() } })));
}
export async function linkBundleToTopic(bundleId: string, topicId: string | null) {
  const topic = topicId ? await db.topics.get(topicId) : null;
  if (topicId && !topic) throw new Error("Topic not found");
  await db.bundles.update(bundleId, { topicId: topicId ?? null, subjectId: topic?.subjectId ?? null, updatedAt: new Date() });
  // Optionally backfill existing cards: set topicId on cards that have bundleId but no topicId
  if (topicId) {
    const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
    for (const c of cards) if (!c.topicId) await db.flashcards.update(c.id, { topicId, subjectId: topic!.subjectId, updatedAt: new Date() });
  }
  return db.bundles.get(bundleId);
}
// Extend createBundle to accept topic link:
export async function createBundle(data: { name: string; description?: string; color?: string; topicId?: string | null }) {
  const parsed = bundleSchema.parse(data);
  // ... if topicId, lookup subjectId ...
}
// Extend getBundles / getBundle to include topic include (for badge rendering)
```

**Step 4: Verify**
Run: `npx tsc --noEmit` -> pass. Manual: create subject→topic→bundle-from-topic, check `bundle.topicId`.

**Step 5: Commit**
```bash
git add src/lib/validations.ts src/app/actions.ts
git commit -m "feat(actions): createBundleFromTopic, linkBundleToTopic, bundle topic include"
```

### Task 3: Keep topicId on cards created under a topic-linked bundle

**Objective:** Cards added to a topic-owned bundle automatically carry that bundle's `topicId`/`subjectId` so they appear in both Topic and Bundle views.

**Files:**
- Modify: `src/app/actions.ts:845-878` (`createBundleFlashcard`), `881-922` (`importCardsIntoBundle`)
- Modify: `src/app/bundles/[id]/cards/page.tsx:94-100` (load) and `154-175` (handleCreate)

**Step 1: Implement**
```ts
// createBundleFlashcard — after parsing, if bundle has topicId, inject it:
const bundle = await db.bundles.get(rest.bundleId);
const topicId = bundle?.topicId ?? null;
const subjectId = bundle?.subjectId ?? null;
// FlashcardRec: { ..., topicId, subjectId, bundleId }
```
Same for `importCardsIntoBundle` bulk creation.

On the UI side, `BundleCardsPage` already reads `bundleId` param — just ensure it loads bundle to show breadcrumb; the action handles injection so UI needs no extra form fields.

**Step 2: Verify**
Create topic → bundle from topic → add card → check `db.flashcards` has both ids in devtools / via `getBundleCards` + `getTopics` counts.

**Step 3: Commit**
```bash
git add src/app/actions.ts src/app/bundles/\[id\]/cards/page.tsx
git commit -m "feat(cards): auto-link cards to bundle topic"
```

### Task 4: Subjects page — make topics usable (stats + actions + create-bundle flow)

**Objective:** Transform the static topics list into an actionable hub.

**Files:**
- Modify: `src/app/subjects/page.tsx:34-397`

**UI changes (no new route, stays in modal + inline chips):**
- `openManageTopics` now fetches per-topic stats: note count + flashcard count (via `db.notes.where("topicId")`, `db.flashcards.where("topicId")` or new helper `getTopicsWithCounts`) + linked bundles via `getBundlesByTopic`.
- Row layout: `Topic name` | badges `N notes · M cards · K bundles` | action buttons:
  - `CARDS` → `router.push(`/bundles/${bundleId}/cards`)` for primary bundle, or `/flashcards?topic=${topicId}` / fallback to filtered browse. For MVP, if topic has ≥1 bundle, link to first bundle's cards; otherwise button = `CREATE BUNDLE`.
  - `NOTES` → `router.push(`/notes?topic=${topicId}`)` (notes page will filter — see Task 5) or open notes filtered view inline.
  - `NEW BUNDLE` → calls `createBundleFromTopic(topic.id)` then refreshes list + shows undo toast.
  - `LINK` → small dropdown of unlinked bundles to `linkBundleToTopic`.
- Inline create-bundle: when user clicks `NEW BUNDLE`, create immediately with sensible defaults (topic name, subject color) — no extra modal, just optimistic UI + toast with `View bundle`.
- Search within modal (optional).

**Step 1: Implement helper inside page or import from actions:**
Add `getTopicsWithStats` or do inline `Promise.all` — keep simple.
Add state: `topicStats: Record<string, { notes, cards, bundles: BundleRec[] }>`

**Step 2: Verify manual**
- Create subject "Physics" → add topic "Kinematics" → see `0 notes · 0 cards` → click `NEW BUNDLE` → bundle "Kinematics" appears on `/bundles` with topic badge → add cards via `Manage cards` → return to subjects modal → count updates to `3 cards`.

**Step 3: Commit**
```bash
git add src/app/subjects/page.tsx
git commit -m "feat(subjects): usable topics — stats, view cards/notes, create/link bundle"
```

### Task 5: Notes & Flashcards filtering by topic + Bundle topic badges

**Objective:** Navigation is bidirectional — from topic you can filter notes/cards, from bundle you see its topic.

**Files:**
- Modify: `src/app/notes/page.tsx` (support `?topic=` query param filter as in flashcards)
- Modify: `src/app/flashcards/page.tsx` (bundle cards already show topic badge in many places — ensure new bundles show `Subject › Topic`)
- Modify: `src/app/bundles/page.tsx:167-271` (bundle card footer: show `Subject › Topic` badge when `bundle.topicId` set)
- Modify: `src/app/bundles/[id]/cards/page.tsx:60-65, 242-260` (header breadcrumb showing topic link)

**Steps:**
- Notes: read `searchParams.get("topic")` via `useSearchParams`, default filter `filteredNotes` to include `topicId` match, add clear filter chip + keep existing text search.
- Bundles list: in `useEffect` after `getBundles()`, each bundle now has `topic` include; render badge:
```tsx
{bundle.topic && <span className="...">{bundle.topic.subject?.name} › {bundle.topic.name}</span>}
```
- Bundle cards header: show breadcrumb `Subject › Topic › Bundle`.

**Verify:** Visit `/notes?topic=t1` filters correctly; bundles with topic show badge.

**Commit:**
```bash
git add src/app/notes/page.tsx src/app/bundles/page.tsx src/app/bundles/\[id\]/cards/page.tsx src/app/flashcards/page.tsx
git commit -m "feat(nav): topic filters + bundle topic badges"
```

### Task 6: Polish, empty states, and regression check

**Files:**
- `src/components/subject-topic-select.tsx` (ensure new topic flow still works)
- `src/app/actions.ts` (cascade delete: `deleteTopic` should optionally unlink bundles or keep them — choose unlink `topicId->null` not delete)
- `src/lib/db.ts` version bump already done

**Steps:**
- Ensure `deleteTopic` does not delete bundles; instead `db.bundles.where("topicId").equals(id).modify({ topicId: null, subjectId: null })`.
- Add empty-state guidance in topics modal: "No topics yet — add one, then create a bundle for it."
- Run full verification:
```bash
npm run build
npx tsc --noEmit
```
- Manual QA: subjects → topics → create bundle → add cards → study via flashcards (description still shows per previous fix) → notes linked to same topic → flashcard count correct on subject card.

**Commit:**
```bash
git add .
git commit -m "fix: topic deletion unlinks bundles; polish empty states"
```

---

## Tests / validation

- `npm run build` — must pass (Next 16 turbopack).
- `npx tsc --noEmit` — zero errors.
- Manual Dexie checks in browser console:
```js
await (await import("@/lib/db")).db.bundles.toArray()
await (await import("@/app/actions")).getBundlesByTopic("topicId")
```
- E2E light: create subject → topic → bundle from topic → add 2 cards (with description) → review in `/flashcards?bundle=...` → description visible (from prior fix) + topic badge visible.

## Risks, tradeoffs, open questions

- **Risk:** Dual-linking cards (`topicId` + `bundleId`) could confuse legacy queries that filter by `topicId` only. Mitigation: keep both ids, all existing queries use `where("topicId")` OR `where("bundleId")` correctly; we add new helpers but don't change legacy filters.
- **Tradeoff:** Choosing inline modal actions vs new `/topics/[id]` page. Decision: stay inline (faster, no new route) — can evolve to a dedicated topic page later if user wants.
- **Open Q:** Should deleting a topic delete its bundles? Plan: **no** — just unlink (user explicit). Can change to cascade if desired.
- **Open Q:** Should `SubjectTopicSelect` show bundles for topic? Out of scope for this plan; leave as topic picker only.
- **Backwards compat:** Dexie v4 additive — no data migration prompt, no `localStorage` wipe needed. If IndexedDB was v3, Dexie auto-upgrades.

