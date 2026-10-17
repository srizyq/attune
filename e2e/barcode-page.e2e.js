import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';

// The barcode result is a full page: product card, how it fits today, energy
// and macros, portion + meal pickers, nutrition facts with % daily value, and
// a pinned Log bar with "Log & scan another".
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const OFF_PRODUCT = {
  status: 1,
  product: {
    product_name: 'Oikos Pro High-Protein Greek Yogurt', brands: 'Dannon', serving_size: '150 g',
    image_front_small_url: PIXEL, nutriscore_grade: 'a', labels_tags: ['en:gluten-free', 'en:something-unknown'],
    nutriments: {
      'energy-kcal_100g': 93, proteins_100g: 16.7, carbohydrates_100g: 5.3, fat_100g: 1, fiber_100g: 0, sodium_100g: 0.03, sugars_100g: 2,
      'saturated-fat_100g': 0.3, calcium_100g: 0.17,
    },
  },
};

const foodLogPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};

async function lookup(page, code) {
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill(code);
  await page.getByRole('button', { name: 'Look up' }).click();
}

test('barcode result page shows the product, extras from Open Food Facts, and logs with the pinned button', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF_PRODUCT) }));
  await lookup(page, '036000291452');

  const result = page.getByTestId('barcode-result');
  await expect(result.getByText('Oikos Pro High-Protein Greek Yogurt')).toBeVisible();
  await expect(result.getByText('Dannon')).toBeVisible();
  await expect(result.getByText('NutriScore A')).toBeVisible();
  await expect(result.getByText('Gluten-free')).toBeVisible();
  await expect(result.getByText('something-unknown')).toHaveCount(0);
  await expect(result.getByText('Total energy')).toBeVisible();
  await expect(result.getByText('Nutrition facts')).toBeVisible();
  await assertLayout(page, testInfo, 'x-barcode-result', ctx);

  // Portion shortcuts rescale the pinned button's kcal.
  const log = result.getByRole('button', { name: /^Log \d+ kcal to / });
  await expect(log).toBeVisible();
  const before = await log.textContent();
  await result.getByRole('button', { name: '½ serving' }).click();
  await expect(log).not.toHaveText(before);

  // Breakfast, exactly: the default meal depends on the time of day, and the
  // pinned button's own name ("Log 70 kcal to Dinner") contains the meal too.
  await result.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await expect(result.getByRole('button', { name: /to Breakfast$/ })).toBeVisible();
  await result.getByRole('button', { name: /to Breakfast$/ }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].food_name).toContain('Oikos Pro');
  expect(posts[0].meal).toMatch(/breakfast/i);
  await expect(page.getByTestId('barcode-result')).toHaveCount(0);
});

test('"Log & scan another" logs the product and goes straight back to the camera', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF_PRODUCT) }));
  await lookup(page, '036000291452');
  await page.getByRole('button', { name: /Log & scan another/ }).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByRole('button', { name: /Enter barcode manually/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Logged Oikos Pro/ })).toBeVisible();
  await expect(page.getByTestId('barcode-result')).toHaveCount(0);
});

test('the heart saves the product as a favourite', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF_PRODUCT) }));
  await lookup(page, '036000291452');
  await page.getByRole('button', { name: 'Add favourite' }).click();
  await expect(page.getByRole('button', { name: 'Remove favourite' })).toBeVisible();
});

test('a product with no photo, score or labels still renders cleanly', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  const bare = { status: 1, product: { product_name: 'Plain rice', serving_size: '100 g', nutriments: { 'energy-kcal_100g': 130, proteins_100g: 2.7, carbohydrates_100g: 28, fat_100g: 0.3 } } };
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bare) }));
  await lookup(page, '1234567890128');
  const result = page.getByTestId('barcode-result');
  await expect(result.getByText('Plain rice')).toBeVisible();
  await expect(result.getByText(/NutriScore/)).toHaveCount(0);
  await expect(result.getByText('Dietary check')).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-barcode-result-bare', ctx);
});

// The result page and the not-found screen must fit every device size in both
// themes (no sideways scroll, nothing cut off or overlapping).
const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`barcode result fits every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(120000);
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFF_PRODUCT) }));
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await lookup(page, '036000291452');
      await expect(page.getByTestId('barcode-result')).toBeVisible();
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height}: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
