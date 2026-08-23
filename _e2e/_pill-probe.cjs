
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("http://localhost:3000/sessions", { waitUntil: "load" });
  await p.waitForTimeout(1800);
  const res = await p.evaluate(() => {
    // find the STOPWATCH text span
    const spans = [...document.querySelectorAll("span")];
    const s = spans.find(x => x.textContent.trim() === "STOPWATCH" && x.className.includes("z-10"));
    if (!s) return "span not found";
    // walk up collecting ALL backgrounds including siblings via elementsFromPoint
    const r = s.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const stack = document.elementsFromPoint(cx, cy).slice(0, 6).map(el =>
      el.tagName + "." + String(el.className).split(" ").slice(0,3).join(".") +
      " bg=" + getComputedStyle(el).backgroundColor);
    return stack;
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
