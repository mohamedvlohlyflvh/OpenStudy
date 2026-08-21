/* Hover-state contrast audit: hover every interactive element, measure
   text-vs-bg contrast IN the hover state, per page x theme. */
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
  ["sessions", "/sessions"],
  ["settings", "/settings"],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const failures = [];

  for (const [pageName, route] of PAGES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);

    for (const theme of THEMES) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(200);

      // Collect interactive elements
      const count = await page.evaluate(() => {
        window.__targets = Array.from(document.querySelectorAll("button, a, [role='switch'], select")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 5 && r.height > 5 && r.top < 3000;
        });
        return window.__targets.length;
      });

      for (let i = 0; i < count; i++) {
        const box = await page.evaluate((idx) => {
          const el = window.__targets[idx];
          if (!el) return null;
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
        }, i);
        if (!box || box.w < 5) continue;

        try {
          await page.mouse.move(box.x, box.y);
          await page.waitForTimeout(260); // let transition settle (200ms duration)

          const res = await page.evaluate((idx) => {
            const el = window.__targets[idx];
            if (!el) return null;
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
            const effBg = (node0) => {
              let node = node0;
              while (node && node !== document.documentElement) {
                const bg = getComputedStyle(node).backgroundColor;
                const rgb = parse(bg);
                if (rgb) {
                  // Only rgba() carries alpha; plain rgb() is always opaque.
                  // (Previous bug: parsed the blue channel as alpha, so black
                  // backgrounds were treated as transparent.)
                  const isRgba = bg.trim().startsWith("rgba(");
                  const alpha = isRgba ? parseFloat(bg.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? "1") : 1;
                  if (alpha > 0.5) return rgb;
                }
                node = node.parentElement;
              }
              return parse(getComputedStyle(document.body).backgroundColor) || [0, 0, 0];
            };
            // Find the DEEPEST element that directly contains visible text,
            // and measure ITS color (not the wrapper's inherited color).
            let textEl = null;
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
              acceptNode: (n) => ((n.textContent || "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
            });
            let firstText = null;
            while (walker.nextNode()) {
              const parent = walker.currentNode.parentElement;
              if (parent) { if (!firstText) firstText = parent; textEl = parent; }
            }
            if (!textEl) textEl = el;
            // Prefer the shallowest text-bearing element (the one whose color
            // actually paints the visible label) — use firstText.
            const paintEl = firstText || textEl;
            const txt = (paintEl.innerText || paintEl.textContent || "").trim().replace(/\n/g, " ").slice(0, 28);
            const cs = getComputedStyle(paintEl);
            const fg = parse(cs.color);
            const bg = effBg(paintEl);
            if (!fg) return null;
            const ratio = contrast(fg, bg);
            const isHovered = el.matches(":hover") || (el.parentElement && el.parentElement.matches(":hover"));
            return { txt, ratio: +ratio.toFixed(2), fg: cs.color, bg: `rgb(${bg.join(",")})`, fs: cs.fontSize, tag: el.tagName, isHovered };
          }, i);

          if (res && res.txt && res.ratio < 4.5 && parseFloat(res.fs) >= 10) {
            failures.push({ page: pageName, theme, ...res });
          }
        } catch (e) { /* element may have moved; skip */ }
      }
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, "hover-audit.json"), JSON.stringify(failures, null, 2));
  // dedupe summary
  const seen = new Set();
  const uniq = failures.filter((f) => {
    const k = `${f.page}|${f.txt}|${f.ratio}|${f.theme === "light" ? "light" : "dark"}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log("HOVER FAILURES (raw):", failures.length, " unique:", uniq.length);
  for (const f of uniq.slice(0, 40)) {
    console.log(`[${f.page}/${f.theme}] "${f.txt}" ratio=${f.ratio} fg=${f.fg} bg=${f.bg} fs=${f.fs} hovered=${f.isHovered}`);
  }
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
