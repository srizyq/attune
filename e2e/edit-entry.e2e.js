import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';
import { USER_ID } from './fixtures.js';

// The entry editor (/log/item/:id): a logged food's numbers against your goals,
// a big amount stepper with quick multipliers and units, the meal it belongs to,
// and an expandable nutrition card.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const slot = (id, label, time, order = 0) => ({ id, user_id: USER_ID, logged_date: TODAY, label, slot_time: `${time}:00`, sort_order: order, target_calories: null, target_protein_g: null, target_carbs_g: null, target_fat_g: null, created_at: new Date().toISOString() });

const YOGURT = {
  id: 'e1', user_id: USER_ID, logged_date: TODAY, meal: 'snacks', food_name: 'Vanilla Greek Yogurt', brand: 'Chobani', calories: 114, protein_g: 20.1, carbs_g: 7, fat_g: 0.4,
  fibre_g: 0, sodium_mg: 50, sugar_g: 6, calcium_mg: 180, potassium_mg: 250, added_sugar_g: 0, serving_grams: 170, source: 'search', logged_amount: 1, logged_unit: 'serving',
  logged_at: new Date().toISOString(), created_at: new Date().toISOString(), slot_id: null,
};
const PHOTO = { ...YOGURT, id: 'e2', food_name: 'Toast and eggs', brand: null, source: 'photo', serving_grams: null, logged_amount: null, logged_unit: null, calories: 300, protein_g: 18, carbs_g: 24, fat_g: 14 };
const LOONG = { ...YOGURT, id: 'e3', food_name: 'Grilled chicken, avocado and quinoa power bowl with lemon tahini dressing (large)', brand: 'The Really Quite Long Named Kitchen Company', calories: 2400, protein_g: 146, carbs_g: 252, fat_g: 126, source: 'search' };
const BACKEND = { tables: { food_logs: [YOGURT, PHOTO, LOONG] } };
const open = async (page, id = 'e1') => { await page.goto(`/log/item/${id}?date=${TODAY}`); await page.getByTestId('edit-log-item').waitFor(); await page.getByRole('heading', { level: 1 }).waitFor(); await settle(page); };
const writes = (page, method) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === method) seen.push(JSON.parse(r.postData() || '{}')); });
  return seen;
};
const amount = (page) => page.getByRole('spinbutton', { name: 'Amount' });

for (const theme of ['dark', 'light']) {
  test(`entry editor · numbers against your goals, portion, meal and nutrition · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { ...BACKEND, profile: { theme } });
    await open(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vanilla Greek Yogurt');
    await expect(page.getByTestId('entry-subtitle')).toHaveText('Chobani · 1 serving');
    await expect(page.getByTestId('entry-energy')).toContainText('114');
    await expect(page.getByTestId('entry-protein')).toContainText('20.1');
    await expect(page.getByTestId('entry-carbs')).toContainText('7');
    await expect(page.getByTestId('entry-fat')).toContainText('0.4');
    // Share of the day's goal (2,100 kcal, 150g protein, 210g carbs, 70g fat).
    await expect(page.getByTestId('entry-energy')).toContainText('5% goal');
    await expect(page.getByTestId('entry-protein')).toContainText('13%');
    await expect(page.getByTestId('entry-carbs')).toContainText('3%');
    await expect(page.getByTestId('entry-fat')).toContainText('<1%');
    await expect(page.getByTestId('entry-meals').getByRole('button', { name: 'Snacks' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Save to Snacks Log' })).toBeVisible();
    await expect(page.getByTestId('nutrition-tile')).toHaveCount(0); // collapsed until asked
    await assertLayout(page, testInfo, `x-entry-editor-${theme}`, ctx);

    await page.getByRole('button', { name: /Nutrition/ }).click();
    await expect(page.getByTestId('nutrition-tile').first()).toBeVisible();
    await assertLayout(page, testInfo, `x-entry-editor-nutrition-${theme}`, ctx);
  });
}

test('the stepper, multipliers and units all describe the same amount of food', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await open(page);
  await expect(amount(page)).toHaveValue('1');
  await page.getByRole('button', { name: 'Increase amount' }).click();
  await expect(amount(page)).toHaveValue('1.5');
  await expect(page.getByTestId('entry-energy')).toContainText('171');
  await expect(page.getByTestId('entry-subtitle')).toHaveText('Chobani · 1.5 servings');
  await page.getByRole('button', { name: 'Decrease amount' }).click();
  await page.getByRole('button', { name: 'Decrease amount' }).click();
  await expect(amount(page)).toHaveValue('0.5');
  await expect(page.getByTestId('entry-multipliers').getByRole('button', { name: '0.5×' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('entry-multipliers').getByRole('button', { name: '2.0×' }).click();
  await expect(amount(page)).toHaveValue('2');
  await expect(page.getByTestId('entry-energy')).toContainText('228');
  // Switching unit keeps how much food it is: 2 servings of a 170g serving is 340g, not 2g.
  await page.getByTestId('entry-units').getByRole('button', { name: 'g', exact: true }).click();
  await expect(amount(page)).toHaveValue('340');
  await expect(page.getByTestId('entry-energy')).toContainText('228');
  await expect(page.getByTestId('entry-multipliers').getByRole('button', { name: '2.0×' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('entry-multipliers').getByRole('button', { name: '1.0×' }).click();
  await expect(amount(page)).toHaveValue('170');
  await page.getByTestId('entry-units').getByRole('button', { name: 'serving', exact: true }).click();
  await expect(amount(page)).toHaveValue('1');
  // Typing a figure works too, and an empty box can't be saved.
  await amount(page).fill('');
  await expect(page.getByRole('button', { name: /^Save to/ })).toBeDisabled();
});

test('save writes the new amount and meal, then goes back', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  const patches = writes(page, 'PATCH');
  await open(page);
  await page.getByTestId('entry-multipliers').getByRole('button', { name: '2.0×' }).click();
  await page.getByTestId('entry-meals').getByRole('button', { name: 'Lunch' }).click();
  await page.getByRole('button', { name: 'Save to Lunch Log' }).click();
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0]).toMatchObject({ meal: 'lunch', calories: 228, logged_amount: 2, logged_unit: 'serving', serving_grams: 340 });
  await expect(page).toHaveURL(/\/log$/);
});

test('Remove item deletes the entry, from the footer and from the ⋯ menu', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  const deletes = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'DELETE') deletes.push(r.url()); });
  await open(page);
  await page.getByRole('button', { name: 'Remove item' }).click();
  await expect.poll(() => deletes.length).toBe(1);
  expect(deletes[0]).toContain('id=eq.e1');
  await expect(page).toHaveURL(/\/log$/);

  await open(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Remove item' }).click();
  await expect.poll(() => deletes.length).toBe(2);
});

test('the Nutrition card opens to the nutrients this food has, and the full list is one tap away', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await open(page);
  await page.getByRole('button', { name: /Nutrition/ }).click();
  const tiles = page.getByTestId('nutrition-tile');
  await expect(tiles.filter({ hasText: 'Calcium' })).toContainText('180mg');
  await expect(tiles.filter({ hasText: 'Potassium' })).toContainText('250mg');
  await expect(tiles.filter({ hasText: 'Sodium' })).toContainText('50mg');
  await expect(tiles.filter({ hasText: 'Iron' })).toHaveCount(0); // no figure, so no made-up zero
  // They follow the amount chosen.
  await page.getByTestId('entry-multipliers').getByRole('button', { name: '2.0×' }).click();
  await expect(tiles.filter({ hasText: 'Calcium' })).toContainText('360mg');
  await page.getByRole('button', { name: 'See all nutrients' }).last().click();
  await expect(page.getByTestId('food-details')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('food-details')).toHaveCount(0);
  await page.getByRole('button', { name: /Nutrition/ }).click();
  await expect(tiles).toHaveCount(0);
});

test('⋯ menu: See all nutrients, and Recalculate only for a photo entry', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await open(page);
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: /Recalculate/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'See all nutrients' }).click();
  await expect(page.getByTestId('food-details')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await open(page, 'e2');
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: 'Recalculate with a new photo' })).toBeVisible();
});

test('an entry with no serving weight scales by calories and says so', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, BACKEND);
  const patches = writes(page, 'PATCH');
  await open(page, 'e2');
  await expect(page.getByTestId('entry-subtitle')).toHaveText('300 kcal');
  await expect(amount(page)).toHaveValue('300');
  await expect(page.getByText('No serving weight, so calories and macros scale together.')).toBeVisible();
  await expect(page.getByTestId('entry-units')).toHaveCount(0);
  await page.getByTestId('entry-multipliers').getByRole('button', { name: '1.5×' }).click();
  await expect(amount(page)).toHaveValue('450');
  await expect(page.getByTestId('entry-energy')).toContainText('450');
  await assertLayout(page, testInfo, 'x-entry-editor-no-weight', ctx);
  await page.getByRole('button', { name: /^Save to/ }).click();
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0]).toMatchObject({ calories: 450, serving_grams: null });
});

test('Pro slots mode edits the time and slot instead of the meal', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { ...BACKEND, profile: { is_premium: true, daily_log_view: 'slots' }, tables: { ...BACKEND.tables, day_slots: [slot('s-morning', 'Morning Fuel', '08:30'), slot('s-lunch', 'Lunch Break', '12:30', 1)] } });
  const patches = writes(page, 'PATCH');
  await open(page);
  await expect(page.getByTestId('entry-meals')).toHaveCount(0);
  await page.getByLabel('Logged at').fill('09:15');
  await page.getByLabel('Slot').selectOption({ label: 'Lunch Break' });
  await assertLayout(page, testInfo, 'x-entry-editor-slots', ctx);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0]).toMatchObject({ slot_id: 's-lunch' });
});

test('a missing entry says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await page.goto(`/log/item/nope?date=${TODAY}`);
  await expect(page.getByText("That entry isn't there any more.")).toBeVisible();
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`entry editor fits every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(240000);
    const ctx = await openApp({ page, context }, testInfo, { ...BACKEND, profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      for (const [label, id, expand] of [['yogurt', 'e1', false], ['yogurt open', 'e1', true], ['long names', 'e3', true], ['no weight', 'e2', false]]) {
        await open(page, id);
        if (expand) await page.getByRole('button', { name: /Nutrition/ }).click();
        for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} ${label}: ${p.check} — ${p.msg}`);
      }
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
