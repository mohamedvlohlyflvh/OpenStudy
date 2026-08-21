/* Diagnose the one remaining card-hover failure: light theme card5.
   Measure EVERY text element inside the hovered card. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(300);

  const n = await page.evaluate(() => {
    window.__cards = Array.from(document.querySelectorAll(".group.cursor-pointer"));
    return window.__cards.length;
  });
  const idx = Math.min(5, n - 1);
  const box = await page.evaluate((i) => {
    const el = window.__cards[i];
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, idx);
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(350);

  const res = await page.evaluate((i) => {
    const el = window.__cards[i];
    const parse = (s) => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
    const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const effBg = (n0) => { let node = n0; while (node && node !== document.documentElement) { const bg = getComputedStyle(node).backgroundColor; const rgb = parse(bg); if (rgb) { const am = bg.match(/rgba?\([^)]*,\s*([\d.]+)\)/); if ((am ? parseFloat(am[1]) : 1) > 0.5) return { rgb, from: node.tagName + "." + (node.className || "").toString().slice(0, 40) }; } node = node.parentElement; } return { rgb: [0, 0, 0], from: "body" }; };
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent || "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    while (walker.nextNode()) {
      const pe = walker.currentNode.parentElement;
      if (!pe) continue;
      const cs = getComputedStyle(pe);
      const fg = parse(cs.color);
      const bgInfo = effBg(pe);
      out.push({
        txt: (walker.currentNode.textContent || "").trim().slice(0, 16),
        el: pe.tagName,
        cls: (pe.className || "").toString().slice(0, 60),
        color: cs.color,
        bg: `rgb(${bgInfo.rgb.join(",")})`,
        bgFrom: bgInfo.from,
        ratio: +contrast(fg, bgInfo.rgb).toFixed(2),
      });
    }
    return { cardHovered: el.matches(":hover"), cardBg: getComputedStyle(el).backgroundColor, items: out };
  }, idx);

  console.log("card hovered:", res.cardHovered, " card bg:", res.cardBg);
  for (const it of res.items) console.log(JSON.stringify(it));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
