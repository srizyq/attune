import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';

// Create custom food is a full page: auto-calculate, scan label, meal chips, base weight,
// the calorie match ring, macro tiles, micronutrients, and "save as recipe card".
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// A recipe row with the new columns, so the photo option is offered.
const WITH_EXTRAS = { tables: { saved_meals: [{ id: 'sm-x', user_id: 'x', name: 'Existing', servings: 1, items: [], created_at: new Date().toISOString(), tags: [], prep_minutes: null, favourite: false, photo_path: null }] } };

const posts = (page, table) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes(`/rest/v1/${table}`) && r.method() === 'POST') seen.push(JSON.parse(r.postData() || '{}')); });
  return seen;
};
const open = async (page) => {
  await page.goto('/food');
  await settle(page);
  await page.getByTitle('Create a custom food').click();
  await page.getByTestId('create-food').waitFor();
};

for (const theme of ['dark', 'light']) {
  test(`create custom food page · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    await open(page);
    const f = page.getByTestId('create-food');
    await f.getByLabel('Food title *').fill("Mum's Lasagna");
    await f.getByLabel('Protein (g)').fill('32');
    await f.getByLabel('Carbs (g)').fill('44');
    await f.getByLabel('Fat (g)').fill('18');
    await expect(f.getByLabel('Calories 466')).toBeVisible();
    await f.getByRole('button', { name: /Detailed micronutrients/ }).click();
    await assertLayout(page, testInfo, `x-create-food-${theme}`, ctx);
  });
}

test('save to My Foods creates the custom food only', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const foods = posts(page, 'custom_foods');
  const logs = posts(page, 'food_logs');
  await open(page);
  const f = page.getByTestId('create-food');
  await f.getByLabel('Food title *').fill('Overnight oats');
  await f.getByLabel('Protein (g)').fill('20');
  await f.getByRole('button', { name: /Save to My Foods/ }).click();
  await expect.poll(() => foods.length).toBe(1);
  expect(foods[0]).toMatchObject({ name: 'Overnight oats', calories: 80, protein_g: 20 });
  await expect(page.getByTestId('create-food')).toHaveCount(0);
  expect(logs).toHaveLength(0);
});

test('save & log immediately adds it to the chosen meal', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const foods = posts(page, 'custom_foods');
  const logs = posts(page, 'food_logs');
  await open(page);
  const f = page.getByTestId('create-food');
  await f.getByLabel('Food title *').fill('Overnight oats');
  await f.getByLabel('Carbs (g)').fill('50');
  await f.getByRole('button', { name: 'Dinner', exact: true }).click();
  await f.getByRole('button', { name: /Save & log immediately to Dinner/ }).click();
  await expect.poll(() => foods.length).toBe(1);
  await expect.poll(() => logs.length).toBe(1);
  expect(logs[0]).toMatchObject({ food_name: 'Overnight oats', meal: 'dinner', source: 'custom', calories: 200 });
});

test('scan label fills the form from the label', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-label', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ serving: '1 bar (40g)', servingGrams: 40, cal: 190, protein: 12, carbs: 18, fat: 8, fibre: 3, sodium: 120, sugar: 5 }) }));
  await open(page);
  await page.getByRole('button', { name: 'Scan label' }).click();
  await page.getByRole('button', { name: 'Take photo' }).click();
  const f = page.getByTestId('create-food');
  await expect(f.getByLabel('Protein (g)')).toHaveValue('12');
  await expect(f.getByLabel('Calories', { exact: true })).toHaveValue('190');
  await expect(f.getByLabel('Unit / portion')).toHaveValue('1 bar (40g)');
});

test('save as recipe card also creates a recipe with the photo', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, WITH_EXTRAS);
  const recipes = posts(page, 'saved_meals');
  const uploads = [];
  page.on('request', (rq) => { if (rq.url().includes('/storage/v1/object/recipe-photos/') && rq.method() === 'POST') uploads.push(rq.url()); });
  await open(page);
  const f = page.getByTestId('create-food');
  await f.getByLabel('Food title *').fill('Chia pudding');
  await f.getByLabel('Protein (g)').fill('10');
  await f.getByRole('switch', { name: 'Save as recipe card' }).click();
  await f.getByLabel('Choose a recipe card photo').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await f.getByRole('button', { name: /Save to My Foods/ }).click();
  await expect.poll(() => recipes.length).toBe(1);
  expect(uploads).toHaveLength(1);
  expect(recipes[0]).toMatchObject({ name: 'Chia pudding', servings: 1 });
  expect(recipes[0].photo_path).toMatch(/\.jpg$/);
  expect(recipes[0].items[0]).toMatchObject({ name: 'Chia pudding', protein: 10 });
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`create custom food fits every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(150000);
    const ctx = await openApp({ page, context }, testInfo, { ...WITH_EXTRAS, profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await open(page);
      await page.getByTestId('create-food').getByRole('button', { name: /Detailed micronutrients/ }).click();
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height}: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
