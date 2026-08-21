// Verifies LineMaskSplit headings animate when scrolled into view inside the
// app's <main class="overflow-y-auto"> scroll container (not window scroll).
const { chromium } = require('playwright');

const settled = (chars) => chars.every((c) => c.y === 0 && c.blur === 0);
const frozen = (chars) => chars.every((c) => c.y === 80 && c.blur === 12);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const sample = (label) => page.evaluate((label) => {
    const find = (text) => [...document.querySelectorAll('[aria-label]')]
      .find((el) => el.getAttribute('aria-label') === label);
    const root = find(label);
    if (!root) return null;
    const chars = [...root.querySelectorAll('.char')].map((c) => {
      const m = (c.style.transform || '').match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
      const b = (c.style.filter || '').match(/blur\(([-\d.]+)px\)/);
      return { y: m ? parseFloat(m[2]) : null, blur: b ? parseFloat(b[1]) : null };
    });
    const rect = root.getBoundingClientRect();
    return { count: chars.length, chars, top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  }, label);

  // 1) Initial state: DASHBOARD (in view) should animate; RECENT SESSIONS (below fold) frozen
  await page.waitForTimeout(1500);
  const dash1 = await sample('DASHBOARD');
  const recent1 = await sample('RECENT SESSIONS');
  const quick1 = await sample('QUICK ACCESS');
  console.log('--- BEFORE SCROLL ---');
  console.log('DASHBOARD:', dash1 ? `chars=${dash1.count} settled=${settled(dash1.chars)} top=${dash1.top}` : 'NOT FOUND');
  console.log('QUICK ACCESS:', quick1 ? `chars=${quick1.count} settled=${settled(quick1.chars)} frozen=${frozen(quick1.chars)} top=${quick1.top}` : 'NOT FOUND');
  console.log('RECENT SESSIONS:', recent1 ? `chars=${recent1.count} frozen=${frozen(recent1.chars)} top=${recent1.top}` : 'NOT FOUND');

  // 2) Scroll the REAL container (<main>) so RECENT SESSIONS enters the viewport
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
  });
  await page.waitForTimeout(2500); // smooth scroll + 0.8s animation

  const recent2 = await sample('RECENT SESSIONS');
  const quick2 = await sample('QUICK ACCESS');
  console.log('--- AFTER SCROLL DOWN ---');
  console.log('RECENT SESSIONS:', recent2 ? `chars=${recent2.count} settled=${settled(recent2.chars)} sample=${JSON.stringify(recent2.chars.slice(0, 3))}` : 'NOT FOUND');
  console.log('QUICK ACCESS:', quick2 ? `chars=${quick2.count} settled=${settled(quick2.chars)} (scrolled past quickly — must NOT freeze mid-flight)` : 'NOT FOUND');

  // 3) Scroll back up (reverse=true should reset), then down again → must replay
  await page.evaluate(() => document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
  const recent3 = await sample('RECENT SESSIONS');
  console.log('--- AFTER SCROLL BACK UP (reverse reset) ---');
  console.log('RECENT SESSIONS:', recent3 ? `frozen=${frozen(recent3.chars)}` : 'NOT FOUND');

  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
  });
  await page.waitForTimeout(2500);
  const recent4 = await sample('RECENT SESSIONS');
  console.log('--- AFTER SECOND SCROLL DOWN (replay) ---');
  console.log('RECENT SESSIONS:', recent4 ? `settled=${settled(recent4.chars)}` : 'NOT FOUND');

  console.log('console errors:', consoleErrors.length === 0 ? 'NONE ✓' : consoleErrors.slice(0, 5));

  const pass =
    dash1 && settled(dash1.chars) &&
    recent1 && frozen(recent1.chars) &&
    recent2 && settled(recent2.chars) &&
    quick2 && settled(quick2.chars) &&
    recent3 && frozen(recent3.chars) &&
    recent4 && settled(recent4.chars) &&
    consoleErrors.length === 0;
  console.log(pass ? '\nALL CHECKS PASSED ✓' : '\nSOME CHECKS FAILED ✗');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
