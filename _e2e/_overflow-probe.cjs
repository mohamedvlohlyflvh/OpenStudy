/* Precise overflow probe: for each element past the viewport edge, find whether an
   ancestor clips it (overflow hidden/auto/scroll) and how much is actually visible. */
const { chromium } = require("playwright");

const PAGES = [
  ["dashboard", "/"],
  ["subjects", "/subjects"],
  ["notes", "/notes"],
  ["bundles", "/bundles"],
  ["bundle-cards", "/bundles/cmt3fzz9v0007qgv4tyxiwh6y/cards"],
  ["flashcards", "/flashcards"],
  ["sessions", "/sessions"],
  ["settings", "/settings"],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  for (const [name, route] of PAGES) {
    await page.goto("http://localhost:3000" + route, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      const all = [...document.querySelectorAll("body *")];
      for (const el of all) {
        if (el.closest(".rfm-marquee") || el.closest(".rfm-initial")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.right <= vw + 2) continue;
        if (rect.left >= vw) continue; // fully offscreen = hidden, not overflow
        // find clipping ancestor
        let clip = null, anc = el.parentElement;
        while (anc && anc !== document.body) {
          const cs = getComputedStyle(anc);
          if (/(hidden|auto|scroll)/.test(cs.overflowX) && anc.scrollWidth > anc.clientWidth) {
            clip = { tag: anc.tagName, cls: String(anc.className).slice(0, 50), ox: cs.overflowX, scrollable: anc.scrollWidth > anc.clientWidth };
            break;
          }
          if (/(hidden|auto|scroll)/.test(cs.overflowX)) {
            clip = { tag: anc.tagName, cls: String(anc.className).slice(0, 50), ox: cs.overflowX, scrollable: false };
            break;
          }
          anc = anc.parentElement;
        }
        // visible fraction
        const visW = Math.max(0, Math.min(rect.right, vw) - rect.left);
        const frac = visW / rect.width;
        out.push({
          tag: el.tagName,
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 35),
          cls: String(el.className).slice(0, 45),
          right: Math.round(rect.right),
          visFrac: Math.round(frac * 100) + "%",
          clip: clip ? `${clip.tag}.${clip.cls} ox=${clip.ox} scroll=${clip.scrollable}` : "NONE→page",
        });
        if (out.length >= 6) break;
      }
      return out;
    });
    if (r.length) {
      console.log(`\n=== ${name} ===`);
      for (const x of r) console.log(`  ${x.tag} "${x.text}" right=${x.right} vis=${x.visFrac} clip=${x.clip}`);
    } else {
      console.log(`\n=== ${name} === clean`);
    }
  }
  await browser.close();
})();
