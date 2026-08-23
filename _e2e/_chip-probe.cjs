
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("http://localhost:3000/flashcards", { waitUntil: "load" });
  await p.waitForTimeout(1800);
  const res = await p.evaluate(() => {
    const divs = [...document.querySelectorAll("div.ml-auto.flex")];
    return divs.map(d => ({
      text: d.textContent.trim().slice(0, 20),
      color: getComputedStyle(d).color,
      bg: getComputedStyle(d).backgroundColor,
    }));
  });
  console.log(JSON.stringify(res, null, 1));
  // also verify flow token on home
  await p.goto("http://localhost:3000/", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-flow").trim());
  console.log("flow token:", t);
  await b.close();
})();
