import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const THEMES = ["aurora","midnight","nebula","matrix","ember","rosewood","cyberpunk","arctic","sandstone","mono","light","paper"];
const ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/subjects", name: "subjects" },
  { path: "/notes", name: "notes" },
  { path: "/bundles", name: "bundles" },
  { path: "/flashcards", name: "flashcards-review" },
  { path: "/flashcards?bundle=demo", name: "flashcards-bundle" },
  { path: "/sessions", name: "sessions" },
  { path: "/stats", name: "stats" },
  { path: "/goals", name: "goals" },
  { path: "/settings", name: "settings" },
  { path: "/offline", name: "offline" },
];

const BASE = "http://localhost:3001";
const OUT = "C:/Users/HP/AppData/Local/hermes/audit/2026-09-03_vision";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// Warm up - ensure dev server ready
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

for (const theme of THEMES) {
  for (const route of ROUTES) {
    const url = BASE + route.path;
    const dir = join(OUT, theme);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${route.name}.png`);
    if (existsSync(file)) { console.log(`SKIP ${theme}/${route.name}`); continue; }
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      // set theme via localStorage then reload to apply CSS vars
      await page.evaluate((t) => {
        try {
          const raw = localStorage.getItem('study-prefs');
          let obj = raw ? JSON.parse(raw) : {};
          obj.theme = t;
          localStorage.setItem('study-prefs', JSON.stringify(obj));
          document.documentElement.setAttribute('data-theme', t);
        } catch(e) {}
      }, theme);
      await page.waitForTimeout(400);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      // dismiss any loading skeleton wait
      await page.waitForTimeout(500);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`OK ${theme}/${route.name}`);
    } catch (e) {
      console.error(`FAIL ${theme}/${route.name}:`, e.message);
    }
  }
}

// also mobile for aurora + light (spot check)
const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const mPage = await mobileCtx.newPage();
for (const theme of ["aurora", "light"]) {
  for (const route of ROUTES.slice(0, 5)) {
    const file = join(OUT, `${theme}_mobile`, `${route.name}.png`);
    mkdirSync(join(OUT, `${theme}_mobile`), { recursive: true });
    if (existsSync(file)) { console.log(`SKIP ${theme}_mobile/${route.name}`); continue; }
    try {
      await mPage.goto(BASE + route.path, { waitUntil: "domcontentloaded" });
      await mPage.waitForTimeout(800);
      await mPage.evaluate((t) => {
        try {
          const raw = localStorage.getItem('study-prefs');
          let obj = raw ? JSON.parse(raw) : {};
          obj.theme = t;
          localStorage.setItem('study-prefs', JSON.stringify(obj));
          document.documentElement.setAttribute('data-theme', t);
        } catch(e) {}
      }, theme);
      await mPage.waitForTimeout(400);
      await mPage.reload({ waitUntil: "domcontentloaded" });
      await mPage.waitForTimeout(1500);
      await mPage.screenshot({ path: file, fullPage: false });
      console.log(`OK ${theme}_mobile/${route.name}`);
    } catch(e) { console.error(`FAIL ${theme}_mobile/${route.name}`, e.message); }
  }
}

await browser.close();
console.log("DONE");
