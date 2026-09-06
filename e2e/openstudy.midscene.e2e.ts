/**
 * OpenStudy E2E — UI/UX + micro-interactions (Midscene.js)
 *
 * Setup:
 *   npm i -D puppeteer @midscene/web tsx
 *   export MIDSCENE_USE_GEMINI=1
 *   export MIDSCENE_MODEL_NAME="gemini-3.6-flash"
 *   export MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
 *   export MIDSCENE_MODEL_API_KEY="<gemini-api-key>"
 *   # free tier is 5 req/min — give retries room to ride out 429s:
 *   export MIDSCENE_MODEL_RETRY_COUNT=8 MIDSCENE_MODEL_RETRY_INTERVAL=25000
 * Run:
 *   npx tsx ./e2e/openstudy.midscene.e2e.ts
 */
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const BASE_URL = 'http://localhost:3000/';

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const agent = new PuppeteerAgent(page);

  // Deterministic hover check: aiHover (human-like locate) + computed-style diff
  // with an exact rect-center fallback before judging. Screenshots alone can't
  // prove hover — the VLM has no resting baseline and no visible cursor.
  async function assertHoverChanges(label: string, aiPrompt: string, findExpr: string, props: string[]) {
    const read = (): Promise<Record<string, string> | null> =>
      page.evaluate((expr: string, ps: string[]) => {
        // eslint-disable-next-line no-eval
        const el = eval(expr) as HTMLElement | undefined;
        if (!el) return null;
        const s = getComputedStyle(el);
        const o: Record<string, string> = {};
        for (const p of ps) o[p] = (s as unknown as Record<string, string>)[p] ?? s.getPropertyValue(p);
        return o;
      }, findExpr, props);
    const resting = await read();
    if (!resting) throw new Error(`${label}: element not found`);
    await agent.aiHover(aiPrompt);
    await new Promise((r) => setTimeout(r, 500));
    let hovered = await read();
    if (JSON.stringify(resting) === JSON.stringify(hovered)) {
      const pos = await page.evaluate((expr: string) => {
        // eslint-disable-next-line no-eval
        const el = eval(expr) as HTMLElement | undefined;
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, findExpr);
      if (!pos) throw new Error(`${label}: element vanished after hover`);
      await page.mouse.move(pos.x, pos.y);
      await new Promise((r) => setTimeout(r, 600));
      hovered = await read();
    }
    console.log(`${label} resting:`, JSON.stringify(resting), 'hovered:', JSON.stringify(hovered));
    if (JSON.stringify(resting) === JSON.stringify(hovered)) {
      throw new Error(`${label}: hover produced no computed-style change: ${JSON.stringify(resting)}`);
    }
  }

  // ============ PHASE 1 — Visual & layout integrity ============
  await agent.aiAction(`navigate to ${BASE_URL}`);
  await agent.aiWaitFor('the dashboard greeting "Good morning, learner" is visible', { timeoutMs: 15000 });
  await agent.aiAssert(
    'Left sidebar with nav links (Dashboard, Subjects, Flashcards, Notes, Sessions, Goals, Stats, Settings) is fully rendered with no overlapping text',
  );
  await agent.aiAssert(
    'Main content shows heading hierarchy: date label, large "Good morning, learner" heading, then FOCUS ZONE section — spacing looks even, nothing clipped or overflowing',
  );
  await agent.aiAssert('Theme selector row shows multiple theme dots and a small footer line shows the AURORA GLASS branding');

  // ============ PHASE 2 — Micro-interactions & hover states ============
  // 2a. Nav link hover
  await assertHoverChanges(
    '2a Flashcards nav hover',
    'the "Flashcards" link in the left sidebar',
    `Array.from(document.querySelectorAll('aside nav a')).find((a) => (a.textContent || '').includes('Flashcards'))`,
    ['backgroundColor', 'color'],
  );

  // 2b. Primary button hover — deterministic: computed style resting vs hovered
  // (a screenshot-only VLM cannot compare states; the real mouse from aiHover
  // keeps :hover applied, so read getComputedStyle before and after).
  const btnStyle = () => page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Start focus session') || b.getAttribute('aria-label') === 'Start focus session',
    );
    if (!btn) return null;
    const s = getComputedStyle(btn);
    // NB: Tailwind v4 scale utilities set the native `scale` property, not `transform`
    return { transform: s.transform, scale: s.scale, boxShadow: s.boxShadow, filter: s.filter };
  });
  const restingStyle = await btnStyle();
  if (!restingStyle) throw new Error('2b: Start focus session button not found');
  await agent.aiHover('the "Start focus session" button in the FOCUS ZONE');
  await new Promise((r) => setTimeout(r, 500)); // let the scale transition land
  let hoveredStyle = await btnStyle();
  if (!hoveredStyle) throw new Error('2b: Start focus session button vanished after hover');
  console.log('Focus button resting:', JSON.stringify(restingStyle), 'hovered:', JSON.stringify(hoveredStyle));
  if (JSON.stringify(restingStyle) === JSON.stringify(hoveredStyle)) {
    // aiHover may land off-target — fall back to the exact rect center, then judge
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Start focus session"]') as HTMLElement;
      if (btn) btn.scrollIntoView({ block: 'center' });
    });
    const pos = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Start focus session"]') as HTMLElement;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(pos.x, pos.y);
    await new Promise((r) => setTimeout(r, 600));
    hoveredStyle = await btnStyle();
    console.log('Focus button precise-hover:', JSON.stringify(hoveredStyle));
  }
  if (JSON.stringify(restingStyle) === JSON.stringify(hoveredStyle)) {
    throw new Error(`2b: hover produced no computed-style change: ${JSON.stringify(restingStyle)}`);
  }

  // 2c. Focus state — deterministic: activeElement + caret for mouse click,
  // visible ring for keyboard (Tab) focus. Screenshots can't catch a blink phase.
  await agent.aiAction('click into the "What are you working on?" text field');
  const readFocus = () => page.evaluate(() => {
    const a = document.activeElement as HTMLInputElement | null;
    if (!a) return null;
    return {
      placeholder: a.getAttribute('placeholder'),
      caret: typeof a.selectionStart === 'number' ? a.selectionStart : null,
    };
  });
  let mouseFocus = await readFocus();
  if (!mouseFocus || mouseFocus.placeholder !== 'What are you working on?') {
    // agent click missed — fall back to the exact input center, then judge
    const pos = await page.evaluate(() => {
      const el = document.querySelector('input[placeholder="What are you working on?"]') as HTMLElement | null;
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!pos) throw new Error('2c: task input not found');
    await page.mouse.click(pos.x, pos.y);
    await new Promise((r) => setTimeout(r, 400));
    mouseFocus = await readFocus();
  }
  console.log('Mouse focus:', JSON.stringify(mouseFocus));
  if (!mouseFocus || mouseFocus.placeholder !== 'What are you working on?' || mouseFocus.caret === null) {
    throw new Error(`2c: click did not focus the task input with a caret: ${JSON.stringify(mouseFocus)}`);
  }
  // keyboard path: blur, then Tab until the input takes focus — ring must appear
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let kbRing: string | null = null;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 120));
    const st = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a.getAttribute('placeholder') !== 'What are you working on?') return null;
      const s = getComputedStyle(a);
      return s.boxShadow;
    });
    if (st !== null) { kbRing = st; break; }
  }
  console.log('Keyboard focus ring box-shadow:', kbRing);
  if (!kbRing || kbRing === 'none') {
    throw new Error(`2c: keyboard focus shows no visible ring: box-shadow=${kbRing}`);
  }
  const focusValue = await agent.aiQuery<string>(
    'the current placeholder or value of the focused session-name input',
  );
  console.log('Focused input state:', focusValue);

  // 2d. Theme dot hover
  await assertHoverChanges(
    '2d Midnight theme dot hover',
    'the "Midnight" theme button in the THEME row',
    `document.querySelector('button[aria-label="Use Midnight theme"]')`,
    ['transform', 'scale'],
  );

  // ============ PHASE 3 — UX feedback & dynamic states ============
  // 3a. Timer start
  await agent.aiAction('click the "Start focus session" button');
  await agent.aiAssert(
    'The Pomodoro timer leaves its idle "25:00" state: countdown is running or the button changed to pause/cancel — clear feedback that the session started',
  );

  // 3b. Modal mechanics — fresh profile => empty Flashcards => CREATE BUNDLE flow,
  // then ADD CARD modal open + backdrop dismiss
  await agent.aiAction('navigate to the Flashcards page via the sidebar link');
  await agent.aiWaitFor('the "CREATE BUNDLE" button is visible', { timeoutMs: 10000 });
  await agent.aiAction('click the "CREATE BUNDLE" button');
  await agent.aiWaitFor('the Bundles page with a "CREATE BUNDLE" button is visible', { timeoutMs: 10000 });
  await agent.aiAction('click the "CREATE BUNDLE" button');
  await agent.aiWaitFor('a bundle creation dialog with a name field is visible', { timeoutMs: 10000 });
  await agent.aiAction('type "E2E Bundle" into the bundle name field and confirm/create it');
  await agent.aiAssert('The bundle dialog closed and a bundle named "E2E Bundle" is listed');
  await agent.aiAction('navigate to the Flashcards page via the sidebar link');
  await agent.aiAction('select the "E2E Bundle" bundle in the ALL BUNDLES dropdown');
  await agent.aiWaitFor('the "ADD CARD" button is visible', { timeoutMs: 10000 });
  await agent.aiAction('click the "ADD CARD" button');
  await agent.aiAssert(
    'A New Card modal/dialog opened with a dimmed backdrop behind it; form fields for front/back are visible',
  );
  await agent.aiAction('click outside the modal on the dimmed backdrop');
  await agent.aiAssert('The New Card modal is dismissed and the Flashcards page is visible again');
  // create a real card so the palette search in 3c has something to find
  await agent.aiAction('click the "ADD CARD" button');
  await agent.aiWaitFor('the New Card modal with front and back fields is visible', { timeoutMs: 10000 });
  await agent.aiAction('fill the front field with "Biology 101" and the back field with "Study of life", then save the card');
  await agent.aiAssert('The modal closed and a card about Biology is now listed');

  // 3c. Command palette (explicit Puppeteer keypresses to guarantee response)
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');

  await agent.aiAssert(
    'A search dialog opened with role=dialog, a "SEARCH CARDS" input is focused, and results or an empty-state hint is shown',
  );
  await agent.aiAction('type "bio" into the palette search input');
  const paletteState = await agent.aiQuery<string>(
    'how many results the search palette shows, or the exact empty-state text if none',
  );
  console.log('Palette state for "bio":', paletteState);

  await page.keyboard.press('Escape');
  await agent.aiAssert('The search palette is closed and the underlying page is interactive again');

  // ============ PHASE 4 — Responsive & mobile viewports ============
  // (return home first: reload keeps the current Flashcards URL)
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  // 4a. Tablet
  await page.setViewport({ width: 768, height: 1024 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await agent.aiWaitFor('the dashboard greeting is visible', { timeoutMs: 15000 });
  await agent.aiAssert(
    'At 768px width (md breakpoint) the sidebar is still visible, and the main content is readable with no horizontal overflow',
  );

  // 4b. Mobile — this app uses a bottom nav on small screens (sidebar hidden md:flex)
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await agent.aiWaitFor('the dashboard content is visible', { timeoutMs: 15000 });
  await agent.aiAssert(
    'At 390px width the desktop sidebar navigation is hidden and a bottom navigation bar with tappable links is visible',
  );
  await agent.aiAction('tap the Flashcards link in the bottom navigation bar');
  await agent.aiAssert(
    'Tapping the bottom-nav Flashcards link opens the Flashcards page readable at mobile width with no horizontal overflow',
  );

  // Restore desktop viewport
  await page.setViewport({ width: 1440, height: 900 });
  await agent.aiAction(`navigate to ${BASE_URL}`);
  await agent.aiAssert('Dashboard renders cleanly at desktop size with no console-visible breakage');

  console.log('✅ OpenStudy Midscene E2E passed successfully!');
  await browser.close();
}

main().catch((err) => {
  console.error('❌ Midscene E2E failed:', err);
  process.exit(1);
});
