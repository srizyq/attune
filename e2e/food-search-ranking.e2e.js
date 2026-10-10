import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// Search puts the plain ingredient first ("potato" -> raw potato, not potato
// pudding), copes with half-typed words, and a barcode nobody has added opens
// a question (add it?) instead of a camera.
// A fake camera, so the scanner and the label camera behave as on a phone.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const ausnut = (id, name) => ({ id, name, derivation: 'x', calories: 80, protein_g: 2, carbs_g: 17, fat_g: 0.1, fibre_g: 2, sodium_mg: 5, sugar_g: 1 });
// What the database returns: shortest names first, so the raw potatoes are
// behind a starch, a dried powder and a pudding.
const POTATO_ROWS = [
  [1, 'Starch, potato'], [2, 'Potato, dehydrated'], [3, 'Potato, peeled, raw'], [4, 'Potato, skin, baked'], [5, 'Potato, unpeeled, raw'],
  [6, 'Soup, potato, homemade'], [7, 'Potato, mashed, dried powder'], [8, 'Potato, red skin, peeled, raw'], [9, 'Sweet potato, boiled'], [10, 'Potato pudding'],
].map(([id, n]) => ausnut(id, n));

const searchBox = (page) => page.getByPlaceholder(/Search any food/);

test('typing potato lists the raw potatoes before the pudding, starch and powder', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: { search_ausnut_foods_ranked: POTATO_ROWS } });
  await page.goto('/food');
  await settle(page);
  await searchBox(page).fill('potato');
  await page.getByText('Potato, peeled, raw').first().waitFor();
  const text = await page.locator('body').innerText();
  const at = (s) => text.indexOf(s);
  expect(at('Potato, peeled, raw'), 'raw potato is listed').toBeGreaterThan(-1);
  for (const later of ['Potato pudding', 'Starch, potato', 'Soup, potato', 'Potato, mashed']) {
    if (at(later) > -1) expect(at('Potato, peeled, raw'), `raw potato above "${later}"`).toBeLessThan(at(later));
  }
  expect(at('Potato, peeled, raw')).toBeLessThan(at('Sweet potato, boiled') === -1 ? Infinity : at('Sweet potato, boiled'));
  await assertLayout(page, testInfo, 'x-search-potato', ctx);
});

test('a half-typed word finds the same foods', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { search_ausnut_foods_ranked: POTATO_ROWS } });
  await page.goto('/food');
  await settle(page);
  await searchBox(page).fill('pota');
  await expect(page.getByText('Potato, peeled, raw').first()).toBeVisible();
});

test('your own saved food that matches is on top', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {
    rpc: { search_ausnut_foods_ranked: POTATO_ROWS },
    tables: { custom_foods: [{ id: 'c1', user_id: USER_ID, created_at: '2026-10-01T00:00:00Z', name: 'My roast potatoes', calories: 200, protein_g: 4, carbs_g: 30, fat_g: 8, fibre_g: 3, sodium_mg: 10, sugar_g: 1, serving_label: '1 cup', serving_grams: 150 }] },
  });
  await page.goto('/food');
  await settle(page);
  await searchBox(page).fill('potato');
  await page.getByText('Potato, peeled, raw').first().waitFor();
  const text = await page.locator('body').innerText();
  expect(text.indexOf('My roast potatoes')).toBeGreaterThan(-1);
  expect(text.indexOf('My roast potatoes')).toBeLessThan(text.indexOf('Potato, peeled, raw'));
});

async function openBarcodeLookup(page, code) {
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

test('a barcode nobody has added asks to add it; the add form has an optional label photo that fills the numbers', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  await page.route('**/api/recognize-label', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ serving: '1 bar (40g)', servingGrams: 40, servingUnit: 'g', cal: 190, protein: 12, carbs: 18, fat: 8, fibre: 3, sodium: 120, sugar: 5 }),
  }));
  await openBarcodeLookup(page, '9310232962474');

  // A question, not a camera: no shutter button, no form yet.
  await expect(page.getByText('Not in our database yet')).toBeVisible();
  await expect(page.getByText(/9310232962474/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take photo' })).toHaveCount(0);
  await expect(page.getByPlaceholder('Product name')).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-barcode-not-found-prompt', ctx);

  // Yes → the add-product form, still with no camera until asked.
  await page.getByRole('button', { name: /Add this product/ }).click();
  await page.getByPlaceholder('Product name').waitFor();
  await expect(page.getByRole('button', { name: 'Take photo' })).toHaveCount(0);
  await page.getByRole('button', { name: /Photograph the nutrition label/ }).click();
  await page.getByRole('button', { name: 'Take photo' }).click();

  await expect(page.getByPlaceholder('Calories')).toHaveValue('190');
  await expect(page.getByPlaceholder('Protein (g)')).toHaveValue('12');
  await expect(page.getByText(/Nobody has added this product yet/)).toBeVisible();
  await page.getByPlaceholder('Product name').fill('Choc protein bar');
  await assertLayout(page, testInfo, 'x-barcode-label-filled', ctx);
  await page.getByRole('button', { name: /Save|Add/ }).last().click();
  await expect(page.getByText('Choc protein bar').first()).toBeVisible();
});

test('backing out of the add form returns to the question; Not now closes the scanner', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  await openBarcodeLookup(page, '9310232962474');
  await page.getByRole('button', { name: /Add this product/ }).click();
  await page.getByPlaceholder('Product name').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Not in our database yet')).toBeVisible();
  // The two buttons that only closed the sheet or duplicated this one are gone.
  await expect(page.getByRole('button', { name: /Search manually/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Create custom food/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByText('Not in our database yet')).toHaveCount(0);
});

test('every lookup failing is a connection problem, not a missing product', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.abort());
  await page.route('**/api/fatsecret-barcode**', (route) => route.abort());
  await page.route('**/rest/v1/barcode_products**', (route) => route.abort());
  await openBarcodeLookup(page, '9310232962474');
  await expect(page.getByText(/Couldn't look up this product/)).toBeVisible({ timeout: 25000 });
  await expect(page.getByPlaceholder('Product name')).toHaveCount(0);
});
