/* Verify Card hover fix: hover dashboard stat cards + quick-nav, measure contrast */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = [];

  for (const theme of ["onyx", "void", "light"]) {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(300);

    // Hover each stat card (Card hover) and measure its title text contrast
    const n = await page.evaluate(() => {
      window.__cards = Array.from(document.querySelectorAll(".group.cursor-pointer"));
      return window.__cards.length;
    });
    for (let i = 0; i < Math.min(n, 6); i++) {
      const box = await page.evaluate((idx) => {
        const el = window.__cards[idx];
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, i);
      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(450); // card bg transition is 200ms; settle fully
      const res = await page.evaluate((idx) => {
        const el = window.__cards[idx];
        const parse = (s) => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
        const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
        const effBg = (n0) => { let node = n0; while (node && node !== document.documentElement) { const bg = getComputedStyle(node).backgroundColor; const rgb = parse(bg); if (rgb) { const isRgba = bg.trim().startsWith("rgba("); const alpha = isRgba ? parseFloat(bg.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? "1") : 1; if (alpha > 0.5) return rgb; } node = node.parentElement; } return [0, 0, 0]; };
        // deepest text element
        let paintEl = null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent || "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
        while (walker.nextNode()) { if (walker.currentNode.parentElement) { paintEl = walker.currentNode.parentElement; break; } }
        if (!paintEl) return null;
        const fg = parse(getComputedStyle(paintEl).color);
        const bg = effBg(paintEl);
        return { txt: (paintEl.textContent || "").trim().slice(0, 20), ratio: +contrast(fg, bg).toFixed(2), hovered: el.matches(":hover") };
      }, i);
      if (res) results.push({ theme, card: i, ...res });
    }
  }
  await browser.close();
  const fails = results.filter((r) => r.ratio < 4.5);
  console.log("CARD HOVER checks:", results.length, " failures:", fails.length);
  for (const r of results.slice(0, 12)) console.log(`[${r.theme}] card${r.card} "${r.txt}" ratio=${r.ratio} hovered=${r.hovered}`);
  if (fails.length) { console.log("FAILURES:"); for (const f of fails) console.log(JSON.stringify(f)); }
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
