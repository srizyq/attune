import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Touch gestures (pull-to-refresh, swipe-between-days) and the install
// prompt. Playwright can't drag with a finger, so the touches are real
// TouchEvents dispatched in the page — the same events the handlers read.
async function touchDrag(page, selector, from, to, { steps = 6 } = {}) {
  await page.evaluate(({ selector, from, to, steps }) => {
    const target = document.querySelector(selector);
    const fire = (type, x, y) => {
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
    };
    fire('touchstart', from[0], from[1]);
    for (let i = 1; i <= steps; i += 1) fire('touchmove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    fire('touchend', to[0], to[1]);
  }, { selector, from, to, steps });
}

const headline = (page) => page.getByText(/kcal logged/);

test('swipe right/left on the daily log changes day; swiping on a row does not', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch gestures only');
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/log');
  await settle(page);
  const dateLabel = () => page.locator('.page-pad').first().evaluate((el) => el.querySelector('div[style*="text-align: center"] div')?.textContent || '');
  const today = await dateLabel();
  expect(today).toMatch(/^Today/i);

  // Swipe left on today: there is no tomorrow, so nothing changes.
  await touchDrag(page, '.page-pad', [300, 400], [90, 405]);
  await page.waitForTimeout(300);
  expect(await dateLabel()).toBe(today);

  // Swipe right: yesterday.
  await touchDrag(page, '.page-pad', [90, 400], [300, 405]);
  await page.waitForTimeout(400);
  const yesterday = await dateLabel();
  expect(yesterday).not.toBe(today);
  expect(yesterday).not.toMatch(/^Today/i);

  // …and left again returns to today.
  await touchDrag(page, '.page-pad', [300, 400], [90, 405]);
  await page.waitForTimeout(400);
  expect(await dateLabel()).toBe(today);

  // A swipe that begins on a food row belongs to swipe-to-delete, not the day.
  const row = page.locator('[data-no-gesture]').first();
  if (await row.count()) {
    await row.evaluate((el) => { el.id = 'swipe-row'; });
    await touchDrag(page, '#swipe-row', [90, 0], [300, 5]);
    await page.waitForTimeout(300);
    expect(await dateLabel()).toBe(today);
  }
  await expect(headline(page)).toBeVisible();
  await assertLayout(page, testInfo, 'x-gesture-day-swipe', ctx);
});

test('pull down from the top of the dashboard refreshes it', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch gestures only');
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const scroller = await page.evaluate(() => { const el = document.querySelector('.app-content-pad'); el.id = 'scroller'; return el.scrollTop; });
  expect(scroller).toBe(0);

  const refetched = page.waitForRequest((r) => r.url().includes('/rest/v1/food_logs') && r.method() === 'GET', { timeout: 5000 });
  await touchDrag(page, '#scroller', [200, 120], [200, 420], { steps: 10 });
  // Check the spinner first: it only lingers ~600ms after the data returns.
  await expect(page.getByTestId('pull-indicator')).toBeVisible({ timeout: 1500 });
  await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-gesture-pull-refresh.png` });
  await refetched;
  await expect(page.getByTestId('pull-indicator')).toHaveCount(0, { timeout: 4000 });
  await assertLayout(page, testInfo, 'x-gesture-after-refresh', ctx);
});

test('a short pull or a pull while scrolled down does not refresh', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch gestures only');
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => { document.querySelector('.app-content-pad').id = 'scroller'; });
  let refetches = 0;
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'GET') refetches += 1; });
  await touchDrag(page, '#scroller', [200, 120], [200, 170]);
  await page.evaluate(() => { document.querySelector('#scroller').scrollTop = 200; });
  await touchDrag(page, '#scroller', [200, 120], [200, 420], { steps: 10 });
  await page.waitForTimeout(800);
  expect(refetches).toBe(0);
});

// An iPhone user a few days in sees the install strip; it opens the steps.
test('install prompt on iPhone Safari', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'phones only');
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    Object.defineProperty(navigator, 'standalone', { get: () => false });
    try { localStorage.setItem('attune_install_prompt_visits', JSON.stringify({ days: ['2026-09-01', '2026-09-02', '2026-09-03'] })); } catch { /* ignore */ }
  });
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const banner = page.getByRole('region', { name: 'Install Attune' });
  await expect(banner).toBeVisible();
  await assertLayout(page, testInfo, 'x-install-banner', ctx);

  await page.getByRole('button', { name: 'Show me how' }).click();
  const dialog = page.getByRole('dialog', { name: /Add Attune to your Home Screen/ });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-install-steps.png` });

  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(banner).toHaveCount(0);
});

test('no install prompt for someone who has just arrived', async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  });
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await expect(page.getByRole('region', { name: 'Install Attune' })).toHaveCount(0);
});

test('swiping the dashboard day strip moves a week at a time, back and forward', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch gestures only');
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const strip = '[data-testid="day-strip"]';
  const state = () => page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid="day-tab"]')];
    return { first: tabs[0].getAttribute('aria-label'), selected: tabs.findIndex((t) => t.getAttribute('aria-pressed') === 'true'), count: tabs.length };
  });
  const thisWeek = await state();
  expect(thisWeek.count).toBe(7);
  expect(thisWeek.selected).toBeGreaterThanOrEqual(0);

  // Nothing after this week: swiping left leaves it alone.
  await touchDrag(page, strip, [300, 10], [90, 12]);
  await page.waitForTimeout(400);
  expect(await state()).toEqual(thisWeek);

  // Swipe right: last week, same weekday selected.
  await touchDrag(page, strip, [90, 10], [300, 12]);
  await page.waitForTimeout(500);
  const lastWeek = await state();
  expect(lastWeek.first).not.toBe(thisWeek.first);
  expect(lastWeek.selected).toBe(thisWeek.selected);

  // And again, two weeks back — past anything the page loads up front is fine.
  await touchDrag(page, strip, [90, 10], [300, 12]);
  await page.waitForTimeout(500);
  const twoBack = await state();
  expect(twoBack.first).not.toBe(lastWeek.first);

  // Swipe left twice: back to this week.
  await touchDrag(page, strip, [300, 10], [90, 12]);
  await page.waitForTimeout(500);
  await touchDrag(page, strip, [300, 10], [90, 12]);
  await page.waitForTimeout(500);
  expect(await state()).toEqual(thisWeek);
  await assertLayout(page, testInfo, 'x-gesture-strip-swipe', ctx);
});
