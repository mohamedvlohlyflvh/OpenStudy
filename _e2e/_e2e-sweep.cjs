/* E2E visual sweep: every page x every theme, full-page screenshots + console errors.
   Headless React 19 can't process clicks, so theme switching is done via direct
   document.documentElement.setAttribute (DOM-level, not React events). */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "_e2e", "screenshots");
const BUNDLE_ID = "cmt0vw15x000bkgv4fz4vdkbe"; // Calculus Formulas (seeded)

const THEMES = ["onyx", "void", "emerald", "magma", "grape", "light"];
const PAGES = [
  ["dashboard", "/"],
  ["subjects", "/subjects"],
  ["notes", "/notes"],
  ["bundles", "/bundles"],
  ["bundle-cards", `/bundles/${BUNDLE_ID}/cards`],
  ["flashcards", "/flashcards"],
  ["flashcards-alldue", "/flashcards?all=1"],
  ["sessions", "/sessions"],
  ["settings", "/settings"],
];

const NOISE = ["webpack-hmr", "WebSocket", "Download the React DevTools", "404 (Not Found)"];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !NOISE.some((n) => msg.text().includes(n))) {
      consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 300) });
    }
  });
  page.on("pageerror", (err) => pageErrors.push({ url: page.url(), text: String(err).slice(0, 300) }));

  const report = [];

  for (const [pageName, route] of PAGES) {
    const url = BASE + route;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1200); // let client components hydrate + fetch

      for (const theme of THEMES) {
        await page.evaluate((t) => {
          document.documentElement.setAttribute("data-theme", t);
        }, theme);
        await page.waitForTimeout(250);
        const dir = path.join(OUT, theme);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${pageName}.png`);
        await page.screenshot({ path: file, fullPage: true });
        report.push({ page: pageName, theme, file: path.relative(OUT, file), ok: true });
      }
    } catch (e) {
      report.push({ page: pageName, route, ok: false, error: String(e).slice(0, 200) });
    }
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, "..", "report.json"), JSON.stringify({ report, consoleErrors, pageErrors }, null, 2));
  console.log("screens:", report.filter((r) => r.ok).length, "/", report.length);
  console.log("console errors:", consoleErrors.length);
  console.log("page errors:", pageErrors.length);
  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors.slice(0, 10), null, 2));
  if (pageErrors.length) console.log(JSON.stringify(pageErrors.slice(0, 10), null, 2));
  const failed = report.filter((r) => !r.ok);
  if (failed.length) console.log("FAILED:", JSON.stringify(failed, null, 2));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
