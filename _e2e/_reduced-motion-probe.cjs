/* Verify reduced-motion toggle: with pref ON the heading must be a static <h1>
   (no SplitText .char spans); with pref OFF the animated LineMaskSplit renders .char spans. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  async function check(reducedMotion) {
    await page.goto(BASE + "/subjects", { waitUntil: "load" });
    await page.evaluate((v) => {
      localStorage.setItem("study-prefs", JSON.stringify({ theme: "onyx", reducedMotion: v, sidebarOpen: true }));
    }, reducedMotion);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const charSpans = document.querySelectorAll("h1 .char").length;
      const attr = document.documentElement.getAttribute("data-reduced-motion");
      return {
        h1Text: h1 ? h1.textContent.trim().slice(0, 20) : null,
        charSpans,
        dataAttr: attr,
        isStatic: charSpans === 0,
      };
    });
  }

  const on = await check(true);
  const off = await check(false);
  console.log("reducedMotion=true :", JSON.stringify(on));
  console.log("reducedMotion=false:", JSON.stringify(off));

  const pass = on.isStatic && on.dataAttr === "true" && !off.isStatic && off.charSpans > 0;
  console.log(pass ? "REDUCED MOTION: PASS" : "REDUCED MOTION: FAIL");

  // Also verify settings page no longer shows COMPACT SIDEBAR
  await page.goto(BASE + "/settings", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const settingsText = await page.evaluate(() => document.body.innerText);
  console.log("settings has COMPACT SIDEBAR:", settingsText.includes("COMPACT SIDEBAR"));
  console.log("settings has REDUCED MOTION:", settingsText.includes("REDUCED MOTION"));

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
