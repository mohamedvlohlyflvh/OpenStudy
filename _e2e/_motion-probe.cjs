/* Verify Originkit motion wiring on the dashboard */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !["webpack-hmr", "WebSocket", "Download the React DevTools"].some((n) => m.text().includes(n))) {
      consoleErrors.push(m.text().slice(0, 200));
    }
  });

  // Motion ON
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("study-prefs", JSON.stringify({ theme: "onyx", reducedMotion: false, sidebarOpen: true })));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);

  const motionOn = await page.evaluate(() => {
    const h1s = document.querySelectorAll("h1").length;
    const h2s = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent.trim().slice(0, 20));
    // scrambletext: per-char spans inside the subtitle wrapper
    const subtitle = document.querySelector("p, div");
    const scrambleChars = document.querySelectorAll('[style*="letter-spacing"]').length;
    // HoverImageReveal rows: links to the 4 nav routes
    const shelfLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((h) => ["/bundles", "/flashcards", "/subjects", "/notes"].includes(h));
    const shelfImgs = document.querySelectorAll("img[src^='data:image/svg']").length;
    const bodyText = document.body.innerText;
    return {
      h1s,
      h2s,
      scrambleChars,
      shelfLinks: [...new Set(shelfLinks)],
      shelfImgs,
      hasSubtitle: bodyText.includes("YOUR LEARNING OVERVIEW"),
      hasQuickAccess: bodyText.includes("QUICK ACCESS"),
    };
  });
  console.log("MOTION ON:", JSON.stringify(motionOn, null, 2));

  // Motion OFF (reduced)
  await page.evaluate(() => localStorage.setItem("study-prefs", JSON.stringify({ theme: "onyx", reducedMotion: true, sidebarOpen: true })));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  const motionOff = await page.evaluate(() => {
    const shelfLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((h) => ["/bundles", "/flashcards", "/subjects", "/notes"].includes(h));
    return {
      h1s: document.querySelectorAll("h1").length,
      shelfLinks: [...new Set(shelfLinks)],
      hasSubtitle: document.body.innerText.includes("YOUR LEARNING OVERVIEW"),
      scrambleChars: document.querySelectorAll('[style*="letter-spacing"]').length,
    };
  });
  console.log("MOTION OFF:", JSON.stringify(motionOff, null, 2));

  console.log("CONSOLE ERRORS:", consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) console.log("  -", e);

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
