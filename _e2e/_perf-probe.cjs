
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("http://localhost:3000/bundles", { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const res = await p.evaluate(() => {
    const spans = document.querySelectorAll("main span span");
    // old GlitchCharReveal produced ~40-60 spans for one subtitle; new is ~6 words
    const sub = [...document.querySelectorAll("main p")].find(x => x.textContent.includes("FLASHCARD DECKS"));
    return { letterSpans: spans.length, subtitleHTMLLength: sub ? sub.innerHTML.length : -1,
             usesWordRise: !!document.querySelector(".word-rise"),
             headingUsesCssReveal: !!document.querySelector(".heading-reveal") };
  });
  console.log(JSON.stringify(res));
  await b.close();
})();
