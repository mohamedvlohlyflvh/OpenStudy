/* Verify: 1) no script-tag console error, 2) tag chip readable on card hover,
   3) theme still applied pre-paint (no flash). */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const THEMES = ["onyx", "void", "emerald", "magma", "grape", "light"];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !["webpack-hmr", "WebSocket", "Download the React DevTools"].some((n) => m.text().includes(n))) {
      consoleErrors.push(m.text().slice(0, 120));
    }
  });

  // 1) No-flash check: set a non-default theme, reload, read data-theme BEFORE hydration settles
  await page.goto(BASE + "/notes", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("study-prefs", JSON.stringify({ theme: "emerald", reducedMotion: false, sidebarOpen: true })));
  await page.reload({ waitUntil: "commit" });
  const earlyTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  console.log("pre-hydration theme attr:", earlyTheme, earlyTheme === "emerald" ? "(NO FLASH ✓)" : "(FLASH ✗)");
  await page.waitForTimeout(1500);

  // 2) Chip hover contrast across themes (notes page has tag chips inside Card hover)
  const chipResults = [];
  for (const theme of THEMES) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(250);
    // find a note card (Card hover = .group.cursor-pointer) and hover it
    const box = await page.evaluate(() => {
      const card = document.querySelector(".group.cursor-pointer");
      if (!card) return null;
      card.scrollIntoView({ block: "center" });
      const r = card.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!box) { console.log(theme, ": no card found"); continue; }
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(400);
    const res = await page.evaluate(() => {
      const parse = (s) => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
      const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      // find the tag chip (span with bg-muted class)
      const chip = Array.from(document.querySelectorAll("span")).find((s) => (s.className || "").includes("bg-muted") && s.textContent.trim().length > 0 && s.getBoundingClientRect().width > 0);
      if (!chip) return { found: false };
      const cs = getComputedStyle(chip);
      const fg = parse(cs.color);
      const bg = parse(cs.backgroundColor);
      return { found: true, txt: chip.textContent.trim().slice(0, 12), ratio: +contrast(fg, bg).toFixed(2), fg: cs.color, bg: cs.backgroundColor };
    });
    chipResults.push({ theme, ...res });
  }
  console.log("CHIP ON HOVER:");
  for (const r of chipResults) console.log(`  [${r.theme}] ${r.found ? `"${r.txt}" ratio=${r.ratio} ${r.ratio >= 4.5 ? "PASS" : "FAIL"}` : "no chip"}`);

  // 3) Console errors
  const scriptErrs = consoleErrors.filter((e) => e.includes("script tag"));
  console.log("script-tag errors:", scriptErrs.length);
  console.log("other console errors:", consoleErrors.filter((e) => !e.includes("script tag")).length);
  for (const e of consoleErrors.slice(0, 3)) console.log("  -", e);

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
