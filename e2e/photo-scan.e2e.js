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
  recommendations: [{ name: 'Regular Mixed Meats Wrap', items: 'Flour tortilla grilled and folded around a filling of french fries, sauces, cheese and mixed meats', cal: 1500, protein: 30, carbs: 58, fat: 40, confidence: 'medium' }],
  items: [],
};

// The confirm step's follow-up request (portions, tweaks, allergens, crop).
const DETAIL = {
  portions: [{ label: '1 regular wrap (~380g)', scale: 1 }, { label: 'Half wrap', scale: 0.5 }, { label: 'Large wrap (~520g)', scale: 1.35 }],
  tweaks: [{ label: 'No cheese', cal: -90, protein: -5, carbs: 0, fat: -7 }, { label: 'Sauce on side', cal: -40, protein: 0, carbs: -2, fat: -4 }, { label: 'Swap fries for salad', cal: -220, protein: -3, carbs: -30, fat: -10 }],
  allergens: ['Dairy', 'Gluten'], sodium_mg: 1180, fibre_g: 4, sugar_g: 6,
  source: { quote: 'Mixed wrap w/ frites', box: [300, 100, 360, 800] },
};

test('menu-scan-confirm-pinned-actions', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-menu', (route) => {
    const isDetail = JSON.parse(route.request().postData() || '{}').detail === true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isDetail ? DETAIL : MENU) });
  });
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
  await expect(page.getByLabel('Portion serving')).toBeVisible();
  await expect(confirm).toContainText('+1500 kcal');
  // A quick tweak moves the number in the pinned button.
  await page.getByRole('button', { name: /No cheese/ }).click();
  await expect(confirm).toContainText('+1410 kcal');
  // Over budget: the bar's red part and the tick are drawn.
  await expect(page.getByTestId('budget-over')).toBeVisible();
  const before = await confirm.boundingBox();
  await page.getByPlaceholder(/extra sauce/i).scrollIntoViewIfNeeded();
  expect((await confirm.boundingBox()).y).toBe(before.y);

  await assertLayout(page, testInfo, 'x-menu-scan-confirm', ctx);

  // "Inspect crop" cuts the dish's line out of the captured photo.
  await page.getByRole('button', { name: 'Inspect crop' }).click();
  const crop = page.getByRole('img', { name: /part of the menu photo/ });
  await crop.waitFor();
  const box = await crop.boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-menu-scan-crop.png` });
  await page.getByRole('button', { name: 'Close' }).last().click();
  await expect(crop).toHaveCount(0);
});

// The "add this product" sheet after a barcode isn't found: its fields used to
// be wider than the sheet, so you had to swipe sideways inside it to reach them.
test('barcode-add-product-fits', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('9310232962474');
  await page.getByRole('button', { name: 'Look up' }).click();
  // A product nobody has added asks whether to add it; yes opens the form.
  await page.getByRole('button', { name: /Add this product/ }).click();
  await page.getByPlaceholder('Product name').waitFor();
  await page.getByPlaceholder('Calories').fill('285');
  await page.waitForTimeout(400);

  // Every field sits inside the sheet — nothing pokes out of its right edge.
  const sheetRight = await page.evaluate(() => document.documentElement.clientWidth);
  for (const ph of ['Product name', 'Brand (optional)', 'Serving (e.g. 1 cup)', 'Calories', 'Protein (g)', 'Sodium (mg)']) {
    const box = await page.getByPlaceholder(ph).boundingBox();
    expect(box.x, ph).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${ph} stays inside the screen`).toBeLessThanOrEqual(sheetRight);
  }
  await assertLayout(page, testInfo, 'x-barcode-add-product', ctx);
});
