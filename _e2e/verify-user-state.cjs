// Reproduces the USER's browser state: persisted prefs in localStorage
// (sidebarOpen:false, theme:'magma') — the exact condition that caused the
// hydration mismatch + script-tag warning. Verifies both are gone and that
// persisted prefs still apply post-mount.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Seed localStorage BEFORE navigation (like the user's real browser)
  await page.addInitScript(() => {
    localStorage.setItem('study-prefs', JSON.stringify({ theme: 'magma', reducedMotion: false, sidebarOpen: false }));
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  const checks = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return {
      dataTheme: document.documentElement.getAttribute('data-theme'),
      sidebarWidth: aside ? getComputedStyle(aside).width : null,
      logoSpanVisible: !!document.querySelector('aside span.text-2xl'),
    };
  });

  const hydrationErrors = consoleMsgs.filter((m) => /Hydration failed|didn't match the client|hydrat/i.test(m));
  const scriptErrors = consoleMsgs.filter((m) => /script tag|Scripts inside React/i.test(m));
  const anyErrors = consoleMsgs.filter((m) => m.startsWith('[error]'));

  console.log('=== USER-STATE REPRODUCTION TEST ===');
  console.log('data-theme after mount:', checks.dataTheme, '(expected: magma)');
  console.log('sidebar width:', checks.sidebarWidth, '(expected: 4rem = collapsed w-16)');
  console.log('logo span rendered:', checks.logoSpanVisible, '(expected: false when collapsed)');
  console.log('hydration mismatch errors:', hydrationErrors.length === 0 ? 'NONE ✓' : hydrationErrors);
  console.log('script-tag errors:', scriptErrors.length === 0 ? 'NONE ✓' : scriptErrors);
  console.log('page errors:', pageErrors.length === 0 ? 'NONE ✓' : pageErrors);
  console.log('--- all console errors (any) ---');
  console.log(anyErrors.length === 0 ? '(none)' : anyErrors.join('\n'));

  await browser.close();
  const pass = hydrationErrors.length === 0 && scriptErrors.length === 0 && pageErrors.length === 0
    && checks.dataTheme === 'magma' && checks.sidebarWidth === '64px' && !checks.logoSpanVisible;
  console.log(pass ? '\nALL CHECKS PASSED ✓' : '\nSOME CHECKS FAILED ✗');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
