/* Programmatic visual audit: per page x theme, check
   1) theme tokens actually applied (body bg matches theme)
   2) text contrast (WCAG AA 4.5:1) for visible text nodes
   3) horizontal overflow (elements wider than viewport)
   4) data vs empty state
   5) invisible text (color == background) */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const BUNDLE_ID = "cmt0vw15x000bkgv4fz4vdkbe";
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

// expected body bg per theme (from globals.css)
const THEME_BG = {
  onyx: "#000000", void: "#05060e", emerald: "#02100b",
  magma: "#120606", grape: "#0c0712", light: "#f4f4f5",
};

function lum(rgb) {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function parseColor(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [+m[1], +m[2], +m[3]];
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const issues = [];

  for (const [pageName, route] of PAGES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);

    for (const theme of THEMES) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(200);

      const audit = await page.evaluate((expectedBgHex) => {
        const parse = (str) => {
          const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m ? [+m[1], +m[2], +m[3]] : null;
        };
        const lum = (rgb) => {
          const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const contrast = (a, b) => {
          const l1 = lum(a), l2 = lum(b);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };
        // effective bg: walk up until non-transparent
        const effBg = (el) => {
          let node = el;
          while (node && node !== document.documentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            const rgb = parse(bg);
            if (rgb && !(rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0 && bg.includes("0)"))) {
              const alphaM = bg.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
              const alpha = alphaM ? parseFloat(alphaM[1]) : 1;
              if (alpha > 0.05) return rgb;
            }
            node = node.parentElement;
          }
          return parse(getComputedStyle(document.body).backgroundColor) || [0, 0, 0];
        };

        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const vw = document.documentElement.clientWidth;

        const lowContrast = [];
        const overflow = [];
        const invisible = [];
        let textNodes = 0;

        const els = document.querySelectorAll("h1,h2,h3,h4,p,span,a,button,label,li,td,th,option,select,input,textarea,div");
        const seen = new Set();
        for (const el of els) {
          const txt = (el.innerText || "").trim();
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // overflow check (only for elements with real width)
          if (rect.right > vw + 2 && rect.width > 10) {
            const key = el.tagName + "|" + Math.round(rect.right);
            if (!seen.has(key)) { seen.add(key); overflow.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), right: Math.round(rect.right), vw }); }
          }
          if (!txt || txt.length === 0) continue;
          // only check leaf-ish text (avoid double counting containers)
          if (el.children.length > 3) continue;
          textNodes++;
          const cs = getComputedStyle(el);
          const fg = parse(cs.color);
          if (!fg) continue;
          const bg = effBg(el);
          const ratio = contrast(fg, bg);
          if (ratio < 4.5 && txt.length > 0 && rect.width > 20) {
            // skip tiny decorative text
            const fs = parseFloat(cs.fontSize);
            if (fs >= 11) lowContrast.push({ text: txt.slice(0, 30), ratio: +ratio.toFixed(2), fg: cs.color, fs });
          }
          // invisible: fg ~ bg
          if (ratio < 1.2) invisible.push({ text: txt.slice(0, 30), ratio: +ratio.toFixed(2) });
        }

        // empty-state detection: does the main content area have real data?
        const main = document.querySelector("main") || document.body;
        const mainText = (main.innerText || "").trim();
        const hasEmptyMsg = /NO (SUBJECTS|NOTES|BUNDLES|CARDS|SESSIONS|TOPICS) YET|NOTHING HERE|EMPTY/i.test(mainText);

        return {
          bodyBg,
          lowContrast: lowContrast.slice(0, 8),
          overflow: overflow.slice(0, 6),
          invisible: invisible.slice(0, 6),
          textNodes,
          hasEmptyMsg,
          mainTextLen: mainText.length,
        };
      }, THEME_BG[theme]);

      // theme applied?
      const gotBg = parseColor(audit.bodyBg);
      const expBg = parseColor(hexToRgb(THEME_BG[theme]));
      const themeApplied = gotBg && expBg && Math.abs(gotBg[0] - expBg[0]) < 8 && Math.abs(gotBg[1] - expBg[1]) < 8 && Math.abs(gotBg[2] - expBg[2]) < 8;

      const rec = { page: pageName, theme, themeApplied, textNodes: audit.textNodes, emptyState: audit.hasEmptyMsg, mainTextLen: audit.mainTextLen };
      if (!themeApplied) issues.push({ ...rec, issue: "THEME NOT APPLIED", bodyBg: audit.bodyBg, expected: THEME_BG[theme] });
      if (audit.lowContrast.length) issues.push({ page: pageName, theme, issue: "LOW CONTRAST", items: audit.lowContrast });
      if (audit.overflow.length) issues.push({ page: pageName, theme, issue: "OVERFLOW", items: audit.overflow });
      if (audit.invisible.length) issues.push({ page: pageName, theme, issue: "INVISIBLE TEXT", items: audit.invisible });
      // data pages that unexpectedly show empty state
      const dataPages = ["subjects", "notes", "bundles", "bundle-cards", "sessions"];
      if (dataPages.includes(pageName) && audit.hasEmptyMsg) issues.push({ page: pageName, theme, issue: "UNEXPECTED EMPTY STATE" });
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, "_e2e", "audit.json"), JSON.stringify(issues, null, 2));
  console.log("TOTAL ISSUES:", issues.length);
  const byType = {};
  for (const i of issues) byType[i.issue] = (byType[i.issue] || 0) + 1;
  console.log(JSON.stringify(byType, null, 2));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
