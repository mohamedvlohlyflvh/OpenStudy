/* Probe: verify which audit flags are REAL vs false positives */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── Dashboard: due banner real contrast + marquee overflow ──
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const dash = await page.evaluate(() => {
    function lum(rgb) {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(a, b) {
      if (a === null || b === null) return null;
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    }
    const out = {};
    // find the DUE paragraph
    const ps = [...document.querySelectorAll("p")];
    const dueP = ps.find((p) => p.textContent.includes("FLASHCARD") && p.textContent.includes("DUE"));
    if (dueP) {
      const cs = getComputedStyle(dueP);
      // walk up for real bg
      let el = dueP, bg = null, bgEl = null;
      while (el) {
        const b = getComputedStyle(el).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; bgEl = el.className; break; }
        el = el.parentElement;
      }
      out.dueTitle = { text: dueP.textContent.trim().slice(0, 30), fg: cs.color, bg, bgEl: String(bgEl).slice(0, 60), ratio: ratio(lum(cs.color), lum(bg)) };
    }
    const subP = ps.find((p) => p.textContent.includes("KEEP YOUR"));
    if (subP) {
      const cs = getComputedStyle(subP);
      let el = subP, bg = null;
      while (el) {
        const b = getComputedStyle(el).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; break; }
        el = el.parentElement;
      }
      out.dueSub = { fg: cs.color, bg, ratio: ratio(lum(cs.color), lum(bg)) };
    }
    // STUDY ALL DUE button
    const btn = [...document.querySelectorAll("button, a")].find((b) => b.textContent.includes("STUDY ALL DUE"));
    if (btn) {
      const target = btn.querySelector("span") || btn;
      const cs = getComputedStyle(btn);
      let el = btn, bg = null;
      while (el) {
        const b = getComputedStyle(el).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; break; }
        el = el.parentElement;
      }
      out.studyBtn = { fg: cs.color, bg, ratio: ratio(lum(cs.color), lum(bg)) };
    }
    out.scroll = { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    return out;
  });
  console.log("DASHBOARD:", JSON.stringify(dash, null, 1));

  // ── Settings: swatch labels real contrast (self-contained inline styles) ──
  await page.goto("http://localhost:3000/settings", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => {
    function lum(rgb) {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(a, b) {
      if (a === null || b === null) return null;
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    }
    const out = [];
    const btns = [...document.querySelectorAll("button[aria-label^='Use']")];
    for (const b of btns) {
      const label = [...b.querySelectorAll("span")].find((s) => /[A-Z]{3,}/.test(s.textContent));
      if (!label) continue;
      const cs = getComputedStyle(label);
      const bgCs = getComputedStyle(b).backgroundColor;
      out.push({ name: label.textContent.trim(), fg: cs.color, ownBg: bgCs, ratio: ratio(lum(cs.color), lum(bgCs)) });
    }
    return out;
  });
  console.log("SWATCHES:", JSON.stringify(sw, null, 1));

  await browser.close();
})();
