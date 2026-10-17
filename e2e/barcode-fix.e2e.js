import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Fixing a scanned product's numbers (kcal or kJ), the same fix reaching
// everyone else, and the add-product form's labelled boxes.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const OFF_PRODUCT = {
  status: 1,
  product: {
    product_name: 'Oikos Pro Greek Yogurt', brands: 'Dannon', serving_size: '150 g',
    nutriments: { 'energy-kcal_100g': 93, proteins_100g: 16.7, carbohydrates_100g: 5.3, fat_100g: 1, fiber_100g: 0, sodium_100g: 0.03, sugars_100g: 2 },
  },
};
const offRoute = (page, body = OFF_PRODUCT) => page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));

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

test('Recalculate lets you correct the numbers in kJ, updates the log and saves the fix for everyone', async ({ page, context }, testInfo) => {
  const fixes = [];
  const ctx = await openApp({ page, context }, testInfo, { rpc: { barcode_correct: (req) => { fixes.push(JSON.parse(req.postData() || '{}')); return null; } } });
  await offRoute(page);
  await lookup(page, '036000291452');
  const result = page.getByTestId('barcode-result');
  await expect(result.getByText('Oikos Pro Greek Yogurt')).toBeVisible();

  await result.getByRole('button', { name: /Recalculate/ }).click();
  const sheet = page.getByRole('heading', { name: 'Fix nutrition' }).or(page.getByText('Fix nutrition', { exact: true }));
  await expect(sheet.first()).toBeVisible();
  // Every box has a title.
  for (const label of ['Energy', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)', 'Sugar (g)', 'Sodium (mg)']) {
    await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
  }
  await assertLayout(page, testInfo, 'x-barcode-fix', ctx);

  await page.getByRole('button', { name: 'kJ', exact: true }).click();
  await page.getByLabel('Energy', { exact: true }).fill('1046');
  await expect(page.getByText('≈ 250 kcal')).toBeVisible();
  await page.getByLabel('Protein (g)').fill('20');
  await page.getByRole('button', { name: 'Save changes' }).click();

  // The page now shows the corrected figure and says it was saved for everyone.
  await expect(result.getByRole('button', { name: /^Log 250 kcal to / }).or(result.getByRole('button', { name: /^Log \d+ kcal to / }))).toBeVisible();
  await expect(result.getByText(/Updated for everyone who scans this product/)).toBeVisible();
  expect(fixes).toHaveLength(1);
  expect(fixes[0]).toMatchObject({ p_barcode: '036000291452', p_calories: 250, p_protein_g: 20 });
});

test('a product someone has corrected beats the other databases', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {
    tables: { barcode_products: [{ barcode: '036000291452', name: 'Oikos Pro Greek Yogurt', brand: 'Dannon', serving: '1 tub (150g)', serving_grams: 150, serving_unit: 'g', calories: 111, protein_g: 20, carbs_g: 8, fat_g: 1.5, fibre_g: 0, sodium_mg: 45, sugar_g: 3, corrected_at: '2026-10-17T00:00:00Z' }] },
  });
  await offRoute(page); // says 93 kcal per 100 g
  await lookup(page, '036000291452');
  const result = page.getByTestId('barcode-result');
  await expect(result.getByText('Label serving: 1 tub (150g)')).toBeVisible();
  await expect(result.getByText(/Numbers corrected by another user/)).toBeVisible();
  await expect(result.getByRole('button', { name: /^Log 111 kcal to / })).toBeVisible();
});

test('a failed save still fixes this log and says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { barcode_correct: () => ({ code: 'x' }) } });
  await page.route('**/rest/v1/rpc/barcode_correct', (route) => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'boom' }) }));
  await offRoute(page);
  await lookup(page, '036000291452');
  const result = page.getByTestId('barcode-result');
  await result.getByRole('button', { name: /Recalculate/ }).click();
  await page.getByLabel('Energy', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(result.getByText(/couldn't save for others/)).toBeVisible();
  await expect(result.getByRole('button', { name: /^Log 200 kcal to / })).toBeVisible();
});

test('Add product: every box has a title and kJ is converted to calories on save', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  const saved = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/barcode_products') && r.method() === 'POST') saved.push(JSON.parse(r.postData() || '{}')); });
  await offRoute(page, { status: 0 });
  await lookup(page, '9300000000999');
  await page.getByRole('button', { name: /Add this product/ }).click();
  for (const label of ['Product name', 'Brand (optional)', 'Serving description', 'Energy', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)', 'Sugar (g)', 'Sodium (mg)']) {
    await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByLabel(/Serving size/)).toBeVisible();
  await assertLayout(page, testInfo, 'x-add-product-labels', ctx);

  await page.getByLabel('Product name').fill('Choc bar');
  await page.getByRole('button', { name: 'kJ', exact: true }).click();
  await page.getByLabel('Energy', { exact: true }).fill('1046');
  await page.getByLabel('Protein (g)').fill('12');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ barcode: '9300000000999', name: 'Choc bar', calories: 250, protein_g: 12 });
});
