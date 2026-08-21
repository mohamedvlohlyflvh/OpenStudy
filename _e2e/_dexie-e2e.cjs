/* E2E: verify the Dexie data layer end-to-end through the real UI.
   Creates subject/topic/bundle/card, reviews a card, checks dashboard stats,
   then verifies persistence across a full page reload. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const TS = Date.now();
const SUBJ = `DexieVerify ${TS}`;
const BUNDLE = `DexieBundle ${TS}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/webpack-hmr|WebSocket|DevTools/.test(m.text()))
      errors.push(m.text().slice(0, 200));
  });

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push({ name, ok, extra });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  };

  // ── 1. Create a subject ──
  await page.goto(BASE + "/subjects", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /NEW SUBJECT/i }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/LINEAR ALGEBRA/i).first().fill(SUBJ);
  await page.getByRole("button", { name: /^CREATE$/i }).click();
  await page.waitForTimeout(1500);
  const subjVisible = await page.getByText(SUBJ).first().isVisible().catch(() => false);
  check("create subject", subjVisible);

  // ── 2. Create a bundle ──
  await page.goto(BASE + "/bundles", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /NEW BUNDLE/i }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/IELTS VOCABULARY/i).first().fill(BUNDLE);
  await page.getByRole("button", { name: /^CREATE$/i }).click();
  await page.waitForTimeout(1500);
  const bundleVisible = await page.getByText(BUNDLE).first().isVisible().catch(() => false);
  check("create bundle", bundleVisible);

  // ── 3. Add a card to the bundle (navigate directly to bundle-cards page) ──
  const bundleId = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open("studymax");
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction("bundles", "readonly");
        const q = tx.objectStore("bundles").getAll();
        q.onsuccess = () => {
          const found = q.result.find((b) => b.name.startsWith("DexieBundle"));
          resolve(found ? found.id : null);
        };
      };
      req.onerror = () => resolve(null);
    });
  });
  check("bundle id found in IndexedDB", !!bundleId, String(bundleId));
  await page.goto(`${BASE}/bundles/${bundleId}/cards`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Add card/i }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/WHAT IS SM-2/i).first().fill("DEXIE TEST Q");
  await page.getByPlaceholder(/SPACED REPETITION ALGORITHM/i).first().fill("DEXIE TEST A");
  await page.getByRole("button", { name: /^CREATE$|^ADD$/i }).click();
  await page.waitForTimeout(1500);
  const cardVisible = await page.getByText("DEXIE TEST Q").first().isVisible().catch(() => false);
  check("add card to bundle", cardVisible);

  // ── 4. Verify persistence across reload ──
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  const cardAfterReload = await page.getByText("DEXIE TEST Q").first().isVisible().catch(() => false);
  check("card persists after reload", cardAfterReload);

  // ── 5. Dashboard stats reflect the data ──
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check("dashboard shows due card", bodyText.includes("1 FLASHCARD DUE") || bodyText.includes("FLASHCARD") && bodyText.includes("DUE"));

  // ── 6. Review the card (SM-2) ──
  await page.goto(BASE + "/flashcards?all=1", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const hasReviewUI = await page.getByText("DEXIE TEST Q").first().isVisible().catch(() => false);
  check("review queue shows card", hasReviewUI);
  if (hasReviewUI) {
    // flip and answer Good
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    await page.keyboard.press("3"); // Good
    await page.waitForTimeout(1500);
    const done = await page.evaluate(() => document.body.innerText);
    check("review completes", done.includes("SESSION COMPLETE") || done.includes("REVIEWED") || !done.includes("DEXIE TEST Q"));
  }

  // ── 7. IndexedDB actually holds the data ──
  const idb = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open("studymax");
      req.onsuccess = () => {
        const d = req.result;
        const tables = Array.from(d.objectStoreNames);
        const counts = {};
        let pending = tables.length;
        if (!pending) return resolve({ tables, counts });
        for (const t of tables) {
          const tx = d.transaction(t, "readonly");
          const cq = tx.objectStore(t).count();
          cq.onsuccess = () => {
            counts[t] = cq.result;
            if (--pending === 0) resolve({ tables, counts });
          };
        }
      };
      req.onerror = () => resolve({ error: "open failed" });
    });
  });
  console.log("IndexedDB state:", JSON.stringify(idb));
  check("IndexedDB 'studymax' db exists with data",
    idb.counts && (idb.counts.subjects >= 1) && (idb.counts.bundles >= 1) && (idb.counts.flashcards >= 1),
    JSON.stringify(idb.counts));

  console.log("\nCONSOLE/PAGE ERRORS:", errors.length ? errors.slice(0, 5) : "none");
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("E2E CRASH:", e); process.exit(1); });
