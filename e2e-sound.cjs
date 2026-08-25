// E2E: soundscape engine produces REAL audio (Web Audio analyser probe)
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let pass = 0, fail = 0;
  const ok = (n, c, x = "") => { c ? (pass++, console.log(`  PASS ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const select = page.getByLabel("Soundscape");
  ok("soundscape select exists", (await select.count()) === 1);

  // Helper: pick a soundscape, wait for fade-in, then probe RMS via an
  // AnalyserNode spliced onto the engine's master gain (TS `private` is
  // compile-time only — accessible at runtime).
  const probe = async (name) => {
    await select.selectOption(name);
    await page.waitForTimeout(1500); // fade-in is 0.8s
    return page.evaluate(() => {
      const eng = window.__soundscape;
      if (!eng) return { err: "no engine" };
      const ctx = eng.ctx;
      const master = eng.master;
      if (!ctx) return { err: "no ctx", name: eng.currentName };
      if (name === "Silence" || !master) {
        return { name: eng.currentName, ctxState: ctx.state, silent: !master };
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      master.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      // sample over ~600ms to catch droplets/clinks/swells
      let peak = 0, sum = 0, n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 600) {
        analyser.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i]);
          if (v > peak) peak = v;
          sum += v * v; n++;
        }
      }
      master.disconnect(analyser);
      return {
        name: eng.currentName,
        ctxState: ctx.state,
        rms: Math.sqrt(sum / n),
        peak,
      };
    });
  };

  for (const name of ["Rain", "Café", "Waves"]) {
    const r = await probe(name);
    console.log(`    ${name}:`, JSON.stringify(r));
    ok(`${name} engine running`, r.ctxState === "running", r.ctxState);
    ok(`${name} produces audible signal`, r.rms > 0.005 && r.peak > 0.01, `rms=${r.rms} peak=${r.peak}`);
  }

  // Silence stops it
  const s = await probe("Silence");
  ok("Silence stops engine", s.name === "Silence" && s.silent === true, JSON.stringify(s));

  // Restart after silence works
  const r2 = await probe("Rain");
  ok("Rain restarts after Silence", r2.rms > 0.005, JSON.stringify(r2));

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(2); });
