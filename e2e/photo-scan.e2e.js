import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// The scan RESULT sheet: Recalculate + Log are pinned under the scrolling
// content (comment box included), so they must stay on screen, un-covered,
// even when the content above is taller than the viewport.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const SCAN = {
  name: 'Croissant with pistachio cream', portion: '1 croissant', confidence: 'medium',
  ingredients: [
    { name: 'Croissant pastry base', grams: 80, cal: 320, protein: 6, carbs: 34, fat: 18 },
    { name: 'Pistachio cream filling/topping', grams: 30, cal: 160, protein: 4, carbs: 12, fat: 11 },
    { name: 'Powdered sugar dusting', grams: 5, cal: 19, protein: 0, carbs: 5, fat: 0 },
  ],
};

test('photo-scan-result-pinned-actions', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-food', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
  await page.goto('/dashboard');
  await settle(page);
  // Same navigation the quick-add sheet's "Scan photo" does — router state
  // that opens the scanner on /food — without depending on that sheet's
  // gesture handling.
  await page.evaluate(() => {
    window.history.pushState({ usr: { openPhotoScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: 'Take photo' }).click();
  const log = page.getByRole('button', { name: /^Log to / });
  await log.waitFor();
  const recalc = page.getByRole('button', { name: /Recalculate/ });
  await page.waitForTimeout(500);

  // Both pinned buttons are on-screen and are what a tap at their centre hits.
  for (const btn of [log, recalc]) {
    const box = await btn.boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y + box.height, 'inside viewport').toBeLessThanOrEqual(vh);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const hit = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el.contains(t); });
    expect(hit, 'nothing covers the button').toBe(true);
  }
  // They stay put when the content scrolls to the comment box.
  const before = await log.boundingBox();
  await page.getByPlaceholder(/it's chicken not fish/i).scrollIntoViewIfNeeded();
  const after = await log.boundingBox();
  expect(after.y).toBe(before.y);

  await assertLayout(page, testInfo, 'x-photo-scan-result', ctx);
});

const MENU = {
  recommendations: [{ name: 'Regular Mixed Meats Wrap', items: 'Flour tortilla grilled and folded around a filling of french fries, sauces, cheese and mixed meats', cal: 700, protein: 30, carbs: 58, fat: 40, confidence: 'medium' }],
  items: [],
};

test('menu-scan-confirm-pinned-actions', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-menu', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MENU) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openMenuScan: true }, key: 'menu', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.getByText('Regular Mixed Meats Wrap').click();
  const confirm = page.getByRole('button', { name: /Confirm & log/ });
  await confirm.waitFor();
  await page.waitForTimeout(500);

  const back = page.getByRole('button', { name: /Back to options/ });
  for (const btn of [confirm, back]) {
    const box = await btn.boundingBox();
    expect(box.y + box.height, 'inside viewport').toBeLessThanOrEqual(page.viewportSize().height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const hit = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
    expect(hit, 'nothing covers the button').toBe(true);
  }
  await expect(confirm).toContainText('+700 kcal');
  const before = await confirm.boundingBox();
  await page.getByPlaceholder(/extra sauce/i).scrollIntoViewIfNeeded();
  expect((await confirm.boundingBox()).y).toBe(before.y);

  await assertLayout(page, testInfo, 'x-menu-scan-confirm', ctx);
});
