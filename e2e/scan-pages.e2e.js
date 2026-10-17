import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Barcode, photo and menu scan are pages of their own (/scan/barcode,
// /scan/photo, /scan/menu) — reached from the quick-add sheet, Food search and
// the recipe builder — not sheets laid over Food search.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const SCAN = { name: 'Toast', portion: '1 slice', confidence: 'high', ingredients: [{ name: 'Toast', grams: 30, cal: 80, protein: 3, carbs: 14, fat: 1 }] };
const OFF = { status: 1, product: { product_name: 'Plain rice', serving_size: '100 g', nutriments: { 'energy-kcal_100g': 130, proteins_100g: 2.7, carbohydrates_100g: 28, fat_100g: 0.3 } } };

const foodLogPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};

test('the quick-add sheet opens each scan as its own page, and back returns to where you were', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'the quick-add + is the phone nav');
  await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-food', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
  for (const [label, path] of [['Scan barcode', '/scan/barcode'], ['Scan photo', '/scan/photo'], ['Scan menu', '/scan/menu']]) {
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: 'Quick add' }).click();
    await page.locator('.modal-panel').getByRole('button', { name: label }).click(); // the sheet's, not the Dashboard shortcut
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    // Close from the camera (its own back arrow) and land on the dashboard again.
    await page.getByRole('button', { name: /Close|Close camera/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test('Food search sends you to the scan pages, and a logged scan returns with a confirmation', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { barcode_products: [] } });
  const posts = foodLogPosts(page);
  await page.route('**/world.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF) }));
  await page.goto('/food');
  await settle(page);
  await page.getByText('Scan barcode', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/scan\/barcode$/);
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('1234567890128');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByTestId('barcode-result').waitFor();
  await page.getByRole('button', { name: /^Log \d+ kcal to / }).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(page).toHaveURL(/\/food$/);
  await expect(page.getByText(/Plain rice added to /)).toBeVisible();
});

test('old links that open a scan through Food search state still land on the page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-food', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openPhotoScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await expect(page).toHaveURL(/\/scan\/photo$/);
  await expect(page.getByRole('button', { name: 'Take photo' })).toBeVisible();
});

test('opened directly with nothing to go back to, closing lands on Food search', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/scan/menu');
  await page.getByRole('button', { name: /Close|Close camera/ }).first().click();
  await expect(page).toHaveURL(/\/food$/);
});

test('a scan started while building a recipe adds to that recipe and comes back to it', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { barcode_products: [] } });
  const posts = foodLogPosts(page);
  await page.route('**/world.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openMealBuilder: true }, key: 'rb', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await expect(page.getByText(/Building recipe · 0 item/)).toBeVisible();
  await page.getByText('Scan barcode', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/scan\/barcode$/);
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('1234567890128');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: /Add \d+ kcal to recipe/ }).click();
  await expect(page).toHaveURL(/\/food$/);
  await expect(page.getByText(/Building recipe · 1 item/)).toBeVisible();
  expect(posts).toHaveLength(0);
});

test('the scan page fills the screen top to bottom, with no bottom nav or gap', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF) }));
  await page.goto('/scan/barcode');
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('1234567890128');
  await page.getByRole('button', { name: 'Look up' }).click();
  const result = page.getByTestId('barcode-result');
  await result.waitFor();
  await settle(page);
  const box = await result.boundingBox();
  const vh = page.viewportSize().height;
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.height)).toBe(vh);
  await expect(page.locator('.app-bottom-nav')).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-scan-page-barcode', ctx);
});

test('while the iOS keyboard is open the bottom nav and + step aside', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'the bottom nav is the phone layout');
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const nav = page.locator('.app-bottom-nav');
  await expect(nav).toBeVisible();
  // lib/nativeKeyboard.js sets this class from the keyboard's show/hide events.
  await page.evaluate(() => document.documentElement.classList.add('kb-open'));
  await expect(nav).toBeHidden();
  await page.evaluate(() => document.documentElement.classList.remove('kb-open'));
  await expect(nav).toBeVisible();
});
