/* Screenshot the polished dashboard in every theme */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "screenshots", "polish");
const THEMES = ["onyx", "void", "emerald", "magma", "grape", "light"];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("study-prefs", JSON.stringify({ theme: "onyx", reducedMotion: false, sidebarOpen: true })));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500); // let heading + scramble settle

  for (const theme of THEMES) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `dashboard_${theme}.png`), fullPage: true });
    console.log("shot:", theme);
  }
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
