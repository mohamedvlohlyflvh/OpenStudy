/* Mobile UX sweep: 390x844 — horizontal overflow, tap targets, bottom-nav overlap, truncation */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "screenshots", "mobile");
const BUNDLE_ID = "cmt3fzz9v0007qgv4tyxiwh6y";

const PAGES = [
  ["dashboard", "/"],
  ["subjects", "/subjects"],
  ["notes", "/notes"],
  ["bundles", "/bundles"],
  ["bundle-cards", `/bundles/${BUNDLE_ID}/cards`],
  ["flashcards", "/flashcards"],
  ["sessions", "/sessions"],
  ["settings", "/settings"],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const issues = [];

  for (const [name, route] of PAGES) {
    try {
      await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

      const r = await page.evaluate(() => {
        const out = { overflow: [], smallTargets: [], bottomOverlap: [], hugeText: [] };
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        out.hScroll = sw > vw + 2 ? { scrollWidth: sw, clientWidth: vw } : null;

        // elements wider than viewport (excluding marquee internals)
        const all = [...document.querySelectorAll("body *")];
        for (const el of all) {
          if (el.closest(".rfm-marquee") || el.closest(".rfm-initial")) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.right > vw + 2 && rect.left < vw) {
            const cs = getComputedStyle(el);
            if (cs.position === "fixed" || cs.overflow !== "visible" || el.scrollWidth > el.clientWidth) continue;
            out.overflow.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(rect.right), vw });
            if (out.overflow.length >= 5) break;
          }
        }

        // tap targets: visible interactive elements < 32px tall/wide
        for (const el of document.querySelectorAll("button, a, select, input[type=checkbox], [role=switch], [role=button]")) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.top > 3000) continue;
          if (rect.width < 32 || rect.height < 32) {
            out.smallTargets.push({ tag: el.tagName, text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30), w: Math.round(rect.width), h: Math.round(rect.height) });
            if (out.smallTargets.length >= 8) break;
          }
        }

        // fixed bottom nav overlapping content: find fixed bottom bar, check content padding-bottom
        const fixedBottom = [...document.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          return (cs.position === "fixed" || cs.position === "sticky") && cs.bottom === "0px" && el.getBoundingClientRect().height > 30;
        });
        for (const bar of fixedBottom) {
          const barRect = bar.getBoundingClientRect();
          if (barRect.top < 100) continue; // top bars
          out.bottomBar = { h: Math.round(barRect.height), cls: String(bar.className).slice(0, 60) };
          // is the last content element hidden behind it?
          const body = document.body;
          const lastEls = [...body.querySelectorAll("main > *, [class*=p-] > div")].slice(-3);
          for (const el of lastEls) {
            const rect = el.getBoundingClientRect();
            if (rect.bottom > barRect.top + 5 && rect.top < barRect.top && rect.height > 20) {
              out.bottomOverlap.push({ cls: String(el.className).slice(0, 50), bottom: Math.round(rect.bottom), barTop: Math.round(barRect.top) });
            }
          }
        }
        return out;
      });

      if (r.hScroll) issues.push({ page: name, issue: "HORIZONTAL SCROLL", ...r.hScroll });
      for (const o of r.overflow) issues.push({ page: name, issue: "ELEMENT OVERFLOW", ...o });
      for (const t of r.smallTargets) issues.push({ page: name, issue: "SMALL TAP TARGET", ...t });
      for (const b of r.bottomOverlap) issues.push({ page: name, issue: "BOTTOM NAV OVERLAP", ...b });
      if (r.bottomBar) console.log(`${name}: bottom bar h=${r.bottomBar.h} ${r.bottomBar.cls}`);
      console.log(`${name}: hScroll=${JSON.stringify(r.hScroll)} overflow=${r.overflow.length} smallTargets=${r.smallTargets.length} overlap=${r.bottomOverlap.length}`);
    } catch (e) {
      issues.push({ page: name, issue: "NAV ERROR", msg: String(e).slice(0, 150) });
      console.log(`${name}: NAV ERROR ${String(e).slice(0, 100)}`);
    }
  }

  fs.writeFileSync(path.join(__dirname, "mobile-audit.json"), JSON.stringify(issues, null, 1));
  console.log("\nTOTAL MOBILE ISSUES:", issues.length);
  await browser.close();
})();
