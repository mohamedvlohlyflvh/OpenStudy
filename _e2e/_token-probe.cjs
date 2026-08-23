
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("http://localhost:3000/", { waitUntil: "load" });
  await p.waitForTimeout(1000);
  const out = {};
  for (const t of ["light", "paper"]) {
    await p.evaluate((th) => document.documentElement.setAttribute("data-theme", th), t);
    await p.waitForTimeout(250);
    out[t] = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        mutedFg: cs.getPropertyValue("--color-muted-fg").trim(),
        accent: cs.getPropertyValue("--color-accent").trim(),
        success: cs.getPropertyValue("--color-success").trim(),
        flow: cs.getPropertyValue("--color-flow").trim(),
      };
    });
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
