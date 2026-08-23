/* Sweep: screenshots of every page × every theme + programmatic audit.
   Audit checks (per page × theme):
   - contrast of visible text vs effective bg (WCAG 4.5:1)
   - overflow past viewport
   - invisible text (ratio < 1.2)
   - console/page errors */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const PAGES = ["/", "/subjects", "/bundles", "/flashcards", "/notes", "/sessions", "/settings"];
const THEMES = ["aurora", "midnight", "nebula", "matrix", "ember", "rosewood", "cyberpunk", "arctic", "sandstone", "mono", "light", "paper"];

// rgba-aware bg walker: only strings starting "rgba(" carry alpha; plain rgb() is opaque
async function audit(page) {
  return page.evaluate(() => {
    const lum = (r, g, b) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: c.startsWith("rgba(") ? (m[4] === undefined ? 1 : +m[4]) : 1 };
    };
    const blend = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
    });
    const ratio = (a, b) => {
      const l1 = lum(a.r, a.g, a.b), l2 = lum(b.r, b.g, b.b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    function effectiveBg(el) {
      let cur = el;
      let acc = null;
      while (cur && cur !== document.documentElement) {
        const c = parse(getComputedStyle(cur).backgroundColor);
        if (c && c.a > 0) {
          if (c.a >= 1) return c;
          acc = acc ? blend(c, acc) : c;
        }
        cur = cur.parentElement;
      }
      const root = parse(getComputedStyle(document.body).backgroundColor) || { r: 11, g: 15, b: 23, a: 1 };
      return acc ? blend(acc, root) : root;
    }
    const issues = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      // deepest text-bearing element
      const el = t.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || +st.opacity < 0.15) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fs = parseFloat(st.fontSize);
      if (fs < 10) continue;
      const fg = parse(st.color);
      if (!fg) continue;
      const bg = effectiveBg(el);
      const r = ratio(fg, bg);
      const label = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "");
      if (r < 1.2) issues.push({ type: "invisible", el: label, ratio: +r.toFixed(2), text: t.textContent.trim().slice(0, 40) });
      else if (r < 4.5 && !/h1|h2|h3|svg/i.test(label)) issues.push({ type: "contrast", el: label, ratio: +r.toFixed(2), text: t.textContent.trim().slice(0, 40) });
    }
    // overflow
    const dw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
    const docOverflow = dw > cw + 2 ? `document ${dw}>${cw}` : null;
    // elements overflowing right edge (skip marquee tracks)
    const overflows = [];
    for (const el of document.querySelectorAll("main *")) {
      const st = getComputedStyle(el);
      if (st.position === "fixed") continue;
      const r2 = el.getBoundingClientRect();
      if (r2.width > 0 && r2.right > cw + 8 && !el.closest("[class*=marquee]")) {
        overflows.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0].slice(0, 30));
        if (overflows.length > 5) break;
      }
    }
    return { issues: issues.slice(0, 12), docOverflow, overflows };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 150)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/webpack-hmr|WebSocket|DevTools|hydrat/i.test(m.text()))
      consoleErrors.push(m.text().slice(0, 150));
  });

  const shotDir = path.join(__dirname, "screenshots-v2");
  fs.mkdirSync(shotDir, { recursive: true });

  const report = {};
  for (const route of PAGES) {
    report[route] = {};
    try {
      await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1600); // hydration + data load
      for (const theme of THEMES) {
        await page.evaluate((t) => {
          document.documentElement.setAttribute("data-theme", t);
          localStorage.setItem("study-prefs", JSON.stringify({ theme: t }));
        }, theme);
        await page.waitForTimeout(320); // transitions settle
        const auditRes = await audit(page);
        report[route][theme] = auditRes;
        await page.screenshot({ path: path.join(shotDir, `${route.replace(/\//g, "_") || "home"}--${theme}.png`), fullPage: false });
      }
      console.log(`done ${route}`);
    } catch (e) {
      report[route]._error = String(e).slice(0, 200);
      console.log(`ERROR ${route}: ${String(e).slice(0, 120)}`);
    }
  }

  // summary: only themes with problems
  const problems = {};
  let total = 0;
  for (const [route, themes] of Object.entries(report)) {
    for (const [theme, res] of Object.entries(themes)) {
      if (!res || !res.issues) continue;
      const n = res.issues.length + (res.docOverflow ? 1 : 0) + res.overflows.length;
      if (n > 0) {
        total += n;
        (problems[route] = problems[route] || {})[theme] = {
          contrast: res.issues.filter((i) => i.type === "contrast").length,
          invisible: res.issues.filter((i) => i.type === "invisible").map((i) => i.text),
          docOverflow: res.docOverflow,
          overflows: res.overflows,
          sample: res.issues.slice(0, 4),
        };
      }
    }
  }
  fs.writeFileSync(path.join(__dirname, "audit-v2.json"), JSON.stringify({ report: problems, totalIssues: total, consoleErrors: [...new Set(consoleErrors)].slice(0, 20) }, null, 2));
  console.log(JSON.stringify({ totalIssues: total, routes: Object.keys(problems), consoleErrors: [...new Set(consoleErrors)].slice(0, 10) }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
