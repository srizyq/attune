import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// The Nutrients page: foods that came without vitamins and minerals borrow them
// from the closest similar food, the card says so, and a nutrient no food had
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
  // The cards carry no "data for / estimated" footnotes any more.
  await expect(page.getByText('No data in the foods logged').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Data for \d+ of|Estimated from similar foods \(/)).toHaveCount(0);
  // Vitamin D: no food had it and none could be estimated.
  await expect(page.getByText('No data in the foods logged').first()).toBeVisible();
  const dash = page.getByText('—', { exact: true });
  await expect(dash.first()).toBeVisible();
  // The B-vitamin group explains where its estimates come from.
  await expect(page.getByText(/marks totals that include estimates/).first()).toBeVisible();
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

test('tapping a nutrient lists the foods that supplied it, biggest first, with estimates marked', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    rpc: { search_ausnut_foods_ranked: (req) => (/yoghurt/i.test(req.postData() || '') ? [YOGHURT] : []) },
    tables: { food_logs: [
      log('l1', { food_name: 'Greek yoghurt', source: 'photo' }),                 // calcium estimated: 120
      log('l3', { food_name: 'Cheese slice', source: 'off', calcium_mg: 200, serving_grams: 20 }), // measured: 200
    ] },
  });
  await page.goto('/nutrients');
  await settle(page);
  await page.getByRole('button', { name: /Calcium: which foods supplied it/ }).click();
  const list = page.getByTestId('nutrient-foods');
  await expect(list.getByText('Foods that supplied it')).toBeVisible();
  const names = await list.getByRole('button', { name: /see all nutrients/ }).allInnerTexts();
  expect(names[0]).toContain('Cheese slice');
  expect(names[1]).toContain('Greek yoghurt');
  await expect(list.getByText('Estimated from a similar food').first()).toBeVisible();
  await expect(list.getByText('63%')).toBeVisible(); // 200 of 320
  await assertLayout(page, testInfo, 'x-nutrient-foods', ctx);
  // A row opens that food's full details.
  await list.getByRole('button', { name: /Cheese slice: see all nutrients/ }).click();
  await expect(page.getByTestId('food-details')).toBeVisible();
  await expect(page.getByText(/nutrients measured/)).toBeVisible();
});

test('averages over 7 days and the By goal view lay out cleanly, and a nutrient page shows what it does', async ({ page, context }, testInfo) => {
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const ctx = await openApp({ page, context }, testInfo, {
    profile: { sex: 'female', date_of_birth: '1995-05-05' },
    tables: { food_logs: [
      log('a1', { food_name: 'Cheese slice', source: 'off', calcium_mg: 200, serving_grams: 20, logged_date: daysAgo(0) }),
      log('a2', { food_name: 'Milk', source: 'off', calcium_mg: 400, serving_grams: 250, logged_date: daysAgo(2) }),
    ] },
  });
  await page.goto('/nutrients');
  await settle(page);
  await page.getByRole('button', { name: '7-day avg' }).click();
  await expect(page.getByText(/Daily average over the 2 of 7 days you logged/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Average of 2 logged days').first()).toBeVisible();
  await assertLayout(page, testInfo, 'x-nutrients-average', ctx);
  await page.getByRole('button', { name: 'By goal' }).click();
  await expect(page.getByTestId('goal-bones')).toBeVisible();
  await assertLayout(page, testInfo, 'x-nutrients-goals', ctx);
  await page.getByRole('button', { name: /Calcium: which foods supplied it/ }).first().click();
  const list = page.getByTestId('nutrient-foods');
  await expect(list.getByText('Daily average · 2 of 7 days logged')).toBeVisible();
  await expect(list.getByTestId('nutrient-daily-bars')).toBeVisible();
  await expect(list.getByTestId('nutrient-info')).toContainText('Builds and maintains bones');
  await assertLayout(page, testInfo, 'x-nutrient-foods-average', ctx);
});

test('a saved supplement is taken in one tap and counts in the day', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    profile: { sex: 'female', date_of_birth: '1995-05-05', life_stage: 'none' },
    tables: {
      food_logs: [],
      supplements: [{ id: 's1', user_id: USER_ID, name: 'Vitamin D3', serving_label: '1 capsule', nutrients: { vitaminD: 25 }, created_at: new Date().toISOString() }],
    },
  });
  await page.goto('/nutrients');
  await settle(page);
  const card = page.getByTestId('supplements-card');
  await expect(card.getByText('Vitamin D3')).toBeVisible();
  await expect(card.getByText(/Vitamin D 25mcg/)).toBeVisible();
  await card.getByRole('button', { name: /Take Vitamin D3/ }).click();
  await expect(card.getByText('✓ 1×')).toBeVisible();
  await assertLayout(page, testInfo, 'x-nutrients-supplements', ctx);
  // The add form opens, needs a name and an amount, and lays out within the screen.
  await card.getByRole('button', { name: /Add/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a supplement' });
  await expect(dialog.getByRole('button', { name: 'Save supplement' })).toBeDisabled();
  await dialog.getByLabel('Name').fill('Fish oil');
  await dialog.getByLabel(/Omega-3/).fill('300');
  await expect(dialog.getByRole('button', { name: 'Save supplement' })).toBeEnabled();
  await assertLayout(page, testInfo, 'x-supplement-form', ctx);
});

test('a supplement taken counts on the Nutrients page but never appears in the daily log', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    tables: { food_logs: [
      log('f1', { food_name: 'Chicken salad', source: 'local', calories: 350 }),
      log('s1', { food_name: 'Vitamin D3 tablet', source: 'supplement', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, vitamin_d_mcg: 25 }),
    ] },
  });
  await page.goto('/log');
  await settle(page);
  await expect(page.getByText('Chicken salad').first()).toBeVisible();
  await expect(page.getByText('Vitamin D3 tablet')).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-log-without-supplement', ctx);
  await page.goto('/nutrients/vitaminD');
  await settle(page);
  await expect(page.getByTestId('nutrient-foods').getByText('Vitamin D3 tablet').first()).toBeVisible();
});
