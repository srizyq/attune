import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// The Nutrients page: foods that came without vitamins and minerals borrow them
// from the closest AUSNUT food, the card says so, and a nutrient no food had
// shows a dash instead of a misleading 0.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const log = (id, over) => ({
  id, user_id: USER_ID, logged_date: ymd(new Date()), meal: 'lunch', food_name: 'x', calories: 100, protein_g: 5, carbs_g: 10, fat_g: 3,
  fibre_g: 0, sodium_mg: 0, sugar_g: 0, serving_grams: 100, source: 'off', created_at: new Date().toISOString(), ...over,
});
const YOGHURT = { id: 'ausnut_1', name: 'Yoghurt, Greek style, plain', calories: 100, calcium_mg: 120, magnesium_mg: 11, zinc_mg: 0.5, vitamin_b12_mcg: 0.5, thiamin_mg: 0.04 };

test('foods without micronutrients get marked estimates; unknowns show a dash, not 0', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    rpc: { search_ausnut_foods_ranked: (req) => (/yoghurt/i.test(req.postData() || '') ? [YOGHURT] : []) },
    tables: { food_logs: [
      log('l1', { food_name: 'Greek yoghurt', source: 'photo' }),                // nothing measured → estimated
      log('l2', { food_name: 'Mystery bar', source: 'community', calories: 200 }),  // nothing measured, no match
      log('l3', { food_name: 'Cheese slice', source: 'off', calcium_mg: 200, serving_grams: 20 }), // measured calcium only
    ] },
  });
  await page.goto('/nutrients');
  await settle(page);
  // Magnesium: nothing measured; one food estimated.
  await expect(page.getByText('Estimated from similar foods (1 of 3)').first()).toBeVisible({ timeout: 20000 });
  // Calcium: one measured + one estimated.
  await expect(page.getByText('Data for 1 of 3 foods · estimates for 1 more')).toBeVisible();
  // Vitamin D: no food had it and none could be estimated.
  await expect(page.getByText('No data in the foods logged').first()).toBeVisible();
  const dash = page.getByText('—', { exact: true });
  await expect(dash.first()).toBeVisible();
  // The B-vitamin group explains where its estimates come from.
  await expect(page.getByText(/Foods without data borrow it from the closest AUSNUT food/).first()).toBeVisible();
  // The estimate is flagged with a ~ on the total.
  await expect(page.getByText(/^~/).first()).toBeVisible();
  await assertLayout(page, testInfo, 'x-nutrients-estimates', ctx);
});

test('a day where every food has its data shows no notes', async ({ page, context }, testInfo) => {
  const full = Object.fromEntries(['saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'potassium_mg', 'added_sugar_g', 'vitamin_d_mcg', 'calcium_mg', 'iron_mg', 'vitamin_a_mcg', 'vitamin_c_mg', 'polyunsaturated_fat_g', 'monounsaturated_fat_g', 'magnesium_mg', 'zinc_mg', 'vitamin_b12_mcg', 'folate_mcg'].map((k) => [k, 2]));
  await openApp({ page, context }, testInfo, { tables: { food_logs: [log('l1', { food_name: 'Fortified cereal', ...full })] } });
  await page.goto('/nutrients');
  await settle(page);
  await expect(page.getByText(/Data for \d+ of/)).toHaveCount(0);
  await expect(page.getByText('Estimated from similar foods')).toHaveCount(0);
});
