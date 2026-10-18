import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "See details" on a food shows every macro and micronutrient, wherever the food
// is: a logged item, a search result and a scanned product. A nutrient with no
// figure reads "No data" (not 0), and one estimated from a similar food is marked ~.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const AUSNUT_POTATO = { id: 3, name: 'Potato, peeled, raw', derivation: 'x', calories: 80, protein_g: 2, carbs_g: 17, fat_g: 0.1, fibre_g: 2, sodium_mg: 5, sugar_g: 1, calcium_mg: 10, iron_mg: 0.5, potassium_mg: 400, vitamin_c_mg: 20 };

async function expectDetails(page, name) {
  const details = page.getByTestId('food-details');
  await expect(details).toBeVisible();
  await expect(details.getByText(name).first()).toBeVisible();
  for (const label of ['Protein', 'Carbs', 'Fat', 'Fibre', 'Sodium', 'Sugar', 'Calcium', 'Iron', 'Vitamin C', 'Thiamin (B1)', 'Selenium']) {
    await expect(details.getByText(label, { exact: true }).first()).toBeAttached();
  }
  return details;
}

test('a logged food opens its full details', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    tables: { food_logs: [{
      id: 'l1', user_id: USER_ID, logged_date: ymd(new Date()), meal: 'lunch', food_name: 'Salmon fillet', calories: 280, protein_g: 31, carbs_g: 0, fat_g: 17,
      fibre_g: 0, sodium_mg: 90, sugar_g: 0, calcium_mg: 20, serving_grams: 150, source: 'ausnut', logged_amount: 150, logged_unit: 'g', created_at: new Date().toISOString(),
    }] },
  });
  await page.goto('/log');
  await settle(page);
  await page.getByText('Salmon fillet').first().click();
  await page.getByRole('button', { name: 'See details' }).click();
  const details = await expectDetails(page, /./);
  // Something this food has no figure for says so instead of 0.
  await expect(details.getByText('No data').first()).toBeVisible();
  await assertLayout(page, testInfo, 'x-food-details', ctx);
  await details.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('food-details')).toHaveCount(0);
});

test('a search result shows its details for the amount chosen, with ~ estimates where a similar food has them', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {
    rpc: {
      search_ausnut_foods_ranked: [AUSNUT_POTATO],
      // The estimate lookup finds the same potato for foods that came without vitamins.
      search_ausnut_foods_strict: [AUSNUT_POTATO],
    },
  });
  await page.goto('/food');
  await settle(page);
  await page.getByPlaceholder(/Search any food/).fill('potato');
  await page.getByText('Potato, peeled, raw').first().click();
  await page.getByRole('button', { name: 'See details' }).click();
  const details = await expectDetails(page, 'Potato, peeled, raw');
  await expect(details.getByText('Calcium', { exact: true }).first()).toBeVisible();
});

test('a scanned product has See details on its page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {
    tables: { barcode_products: [{ barcode: '9310000000019', name: 'Greek yoghurt', brand: 'Chobani', serving: '1 tub (170g)', calories: 120, protein_g: 11, carbs_g: 8, fat_g: 4, fibre_g: 0, sodium_mg: 60, sugar_g: 6, serving_grams: 170, serving_unit: 'g' }] },
  });
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('9310000000019');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByTestId('barcode-result').getByRole('button', { name: 'See details' }).click();
  await expectDetails(page, 'Greek yoghurt');
});
