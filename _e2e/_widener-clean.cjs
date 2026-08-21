/* Clean mobile widener probe — no sidebar interference */
const { chromium } = require("playwright");

const PAGES = [
  ["dashboard", "/"],
  ["subjects", "/subjects"],
  ["notes", "/notes"],
  ["flashcards", "/flashcards"],
  ["sessions", "/sessions"],
  ["settings", "/settings"],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  for (const [name, route] of PAGES) {
    await page.goto("http://localhost:3000" + route, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const main = document.querySelector("main");
      const out = { mainClient: main.clientWidth, mainScroll: main.scrollWidth, wideners: [] };
      for (const el of main.querySelectorAll("*")) {
        if (el.closest(".rfm-marquee") || el.closest(".rfm-initial")) continue;
        const w = el.getBoundingClientRect().width;
        if (w > main.clientWidth + 2) {
          const hasWideChild = [...el.children].some((c) => c.getBoundingClientRect().width > main.clientWidth + 2);
          if (!hasWideChild) {
            out.wideners.push({
              tag: el.tagName,
              cls: String(el.className).slice(0, 70),
              w: Math.round(w),
              text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
            });
          }
        }
        if (out.wideners.length >= 6) break;
      }
      return out;
    });
    console.log(`\n=== ${name} === main: client=${r.mainClient} scroll=${r.mainScroll}`);
    for (const w of r.wideners) console.log(`  WIDENER ${w.tag} w=${w.w} cls="${w.cls}" text="${w.text}"`);
  }
  await browser.close();
})();
