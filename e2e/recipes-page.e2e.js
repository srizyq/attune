import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';
import { USER_ID, SAVED_MEALS } from './fixtures.js';

// Recipes: a list with a Featured card (the recipe you logged most recently), cards with
// photo or icon, your own tags, prep time and a heart; and each recipe on its own page.
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const item = (name, cal, protein, carbs, fat) => ({ name, cal, protein, carbs, fat, servingGrams: 100, loggedAmount: 1, loggedUnit: 'serving' });

const PUDDING = { id: 'r1', user_id: USER_ID, name: 'Raspberry chia pudding', servings: 1, created_at: daysAgo(2), shared_with_friends: false, tags: ['Dessert', 'Pre-workout'], prep_minutes: 10, favourite: true, photo_path: `${USER_ID}/pudding.jpg`,
  items: [item('Raspberries', 68, 1, 15, 0.8), item('Black chia seeds', 13, 0.5, 1, 0.8), item('High protein yoghurt', 90, 15, 5, 0.5), item('Dark chocolate', 198, 2, 18, 14)] };
const OATS = { id: 'r2', user_id: USER_ID, name: 'Pre-workout oats', servings: 1, created_at: daysAgo(5), shared_with_friends: false, tags: ['Pre-workout'], prep_minutes: 5, favourite: false, photo_path: null,
  items: [item('Oats', 300, 10, 50, 6), item('Banana', 105, 1, 27, 0.4)] };
const STEAK = { id: 'r3', user_id: USER_ID, name: 'Steak and greens', servings: 2, created_at: daysAgo(9), shared_with_friends: true, tags: [], prep_minutes: 40, favourite: false, photo_path: null,
  items: [item('Sirloin', 700, 80, 0, 40), item('Broccoli', 100, 8, 12, 1)] };
const BACKEND = {
  tables: {
    saved_meals: [PUDDING, OATS, STEAK],
    // The recipe logged most recently: oats, even though the pudding is newer to the list.
    food_logs: [{ id: 'l1', user_id: USER_ID, logged_date: new Date().toISOString().slice(0, 10), meal: 'breakfast', food_name: 'Pre-workout oats', calories: 405, protein_g: 11, carbs_g: 77, fat_g: 6.4, source: 'recipe', created_at: new Date().toISOString() }],
  },
};

const requests = (page, table, methods = ['PATCH', 'POST']) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes(`/rest/v1/${table}`) && methods.includes(r.method())) seen.push({ method: r.method(), body: JSON.parse(r.postData() || '{}') }); });
  return seen;
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

for (const theme of ['dark', 'light']) {
  test(`recipes list · featured, photo and no-photo cards, tags and filters · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { ...BACKEND, profile: { theme } });
    await page.goto('/recipes');
    await settle(page);
    // Featured is the one logged last (oats), and appears once.
    await expect(page.getByText('Featured · last logged')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open featured recipe Pre-workout oats' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Pre-workout oats' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Raspberry chia pudding' })).toBeVisible();
    await expect(page.getByText('10m prep')).toBeVisible();
    await expect(page.getByText('Dessert').first()).toBeVisible();
    await assertLayout(page, testInfo, `x-recipes-list-${theme}`, ctx);
  });
}

test('filter chips: favourites, high protein, quick and your own tags', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await page.goto('/recipes');
  await settle(page);
  const chips = page.getByRole('group', { name: 'Filter recipes' });
  await expect(chips.getByRole('button', { name: /^All \(3\)/ })).toBeVisible();
  await chips.getByRole('button', { name: 'Pre-workout' }).click();
  await expect(page.getByRole('button', { name: 'Open Raspberry chia pudding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Steak and greens' })).toHaveCount(0);
  await chips.getByRole('button', { name: 'High protein' }).click();
  await expect(page.getByRole('button', { name: 'Open Steak and greens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Raspberry chia pudding' })).toHaveCount(0);
  await chips.getByRole('button', { name: 'Favourites' }).click();
  await expect(page.getByRole('button', { name: 'Open Raspberry chia pudding' })).toBeVisible();
  await chips.getByRole('button', { name: /^Quick/ }).click();
  await expect(page.getByRole('button', { name: /^Open (Raspberry chia pudding|Pre-workout oats)/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Steak and greens' })).toHaveCount(0);   // 40 minutes
  // Searching also looks at tags, and says so when nothing matches.
  await chips.getByRole('button', { name: /^All/ }).click();
  await page.getByLabel('Search recipes').fill('dessert');
  await expect(page.getByRole('button', { name: 'Open Raspberry chia pudding' })).toBeVisible();
  await page.getByLabel('Search recipes').fill('zzz');
  await expect(page.getByText('No recipes match "zzz"')).toBeVisible();
});

test('the heart favourites a recipe and the quick Log adds one serving', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  const patches = requests(page, 'saved_meals', ['PATCH']);
  const logs = requests(page, 'food_logs', ['POST']);
  await page.goto('/recipes');
  await settle(page);
  await page.getByRole('button', { name: 'Add Steak and greens to favourites' }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].body).toEqual({ favourite: true });
  await page.getByRole('button', { name: 'Log Steak and greens' }).click();
  await expect.poll(() => logs.length).toBe(1);
  expect(logs[0].body).toMatchObject({ food_name: 'Steak and greens', source: 'recipe' });
  await expect(page.getByText(/Steak and greens added to /)).toBeVisible();
});

test('a recipe opens on its own page, with macros, ingredients and a pinned Log button', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, BACKEND);
  const logs = requests(page, 'food_logs', ['POST']);
  await page.goto('/recipes');
  await settle(page);
  await page.getByRole('button', { name: 'Open Raspberry chia pudding' }).click();
  await expect(page).toHaveURL(/\/recipes\/r1$/);
  const r = page.getByTestId('recipe-detail');
  await expect(r.getByRole('heading', { name: 'Raspberry chia pudding' })).toBeVisible();
  await expect(r.getByText('369', { exact: true }).first()).toBeVisible();          // 68 + 13 + 90 + 198 kcal
  await expect(r.getByText('Ingredients')).toBeVisible();
  await expect(r.getByText('Black chia seeds', { exact: false })).toBeVisible();
  await expect(r.getByRole('img', { name: 'Raspberry chia pudding' })).toBeVisible();   // the photo
  await assertLayout(page, testInfo, 'x-recipe-detail-photo', ctx);

  await r.getByRole('button', { name: 'Dinner', exact: true }).click();
  await r.getByRole('button', { name: 'Increase amount' }).click();                 // 1 -> 1.5 servings
  await expect(r.getByRole('button', { name: /^Log to Dinner • 554 kcal/ })).toBeVisible();   // 369 x 1.5
  await r.getByRole('button', { name: /^Log to Dinner/ }).click();
  await expect.poll(() => logs.length).toBe(1);
  expect(logs[0].body).toMatchObject({ food_name: 'Raspberry chia pudding', source: 'recipe', meal: 'dinner' });
  await expect(page).toHaveURL(/\/recipes$/);                                          // back where you came from
});

test('a recipe without a photo gets the clean no-photo page', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, BACKEND);
  await page.goto('/recipes/r2');
  const r = page.getByTestId('recipe-detail');
  await expect(r.getByRole('heading', { name: 'Pre-workout oats' })).toBeVisible();
  await expect(r.getByText('5m prep')).toBeVisible();
  await expect(r.getByRole('img', { name: 'Pre-workout oats' })).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-recipe-detail-nophoto', ctx);
});

test('editing: add your own tags and a prep time, then save', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  const patches = requests(page, 'saved_meals', ['PATCH']);
  await page.goto('/recipes/r3');
  const r = page.getByTestId('recipe-detail');
  await r.getByRole('button', { name: 'Edit recipe' }).click();
  const edit = page.getByTestId('recipe-edit');
  await edit.getByLabel('Prep time (minutes, optional)').fill('25');
  await edit.getByLabel('Tags (optional)').fill('Dinner party');
  await edit.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Remove tag Dinner party' })).toBeVisible();
  // Your own tags are offered as quick picks once typed elsewhere.
  await edit.getByLabel('Tags (optional)').fill('pre');
  await edit.getByRole('button', { name: '+ Pre-workout' }).click();
  await expect(edit.getByRole('button', { name: 'Remove tag Pre-workout' })).toBeVisible();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0].body).toMatchObject({ prep_minutes: 25, tags: ['Dinner party', 'Pre-workout'] });
  await expect(r.getByText('Dinner party')).toBeVisible();
});

test('editing: a photo can be added, and removed again', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  const patches = requests(page, 'saved_meals', ['PATCH']);
  const uploads = [];
  page.on('request', (rq) => { if (rq.url().includes('/storage/v1/object/recipe-photos/') && rq.method() === 'POST') uploads.push(rq.url()); });
  await page.goto('/recipes/r2');
  await page.getByTestId('recipe-detail').getByRole('button', { name: 'Edit recipe' }).click();
  await page.getByLabel('Choose a recipe photo').setInputFiles({ name: 'oats.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('recipe-edit').getByRole('img', { name: 'Recipe' })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => uploads.length).toBe(1);
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0].body.photo_path).toMatch(new RegExp(`^${USER_ID}/.+\\.jpg$`));

  // Remove the photo from a recipe that has one.
  await page.goto('/recipes/r1');
  await page.getByTestId('recipe-detail').getByRole('button', { name: 'Edit recipe' }).click();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => patches.some((p) => p.body.photo_path === null)).toBe(true);
});

test('deleting asks first, then removes the recipe', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  let deletes = 0;
  page.on('request', (rq) => { if (rq.url().includes('/rest/v1/saved_meals') && rq.method() === 'DELETE') deletes++; });
  let asked = '';
  page.on('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.goto('/recipes/r3');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
  await expect.poll(() => asked).toContain('Steak and greens');
  expect(deletes).toBe(0);                                                           // dismissed: nothing deleted
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
  await expect.poll(() => deletes).toBe(1);
  await expect(page).toHaveURL(/\/recipes$/);
});

test('before the database update is run, the new fields stay hidden and recipes still work', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { tables: { saved_meals: SAVED_MEALS } });   // no tags / photo / prep columns
  await page.goto('/recipes');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Open Big breakfast' })).toBeVisible();
  await expect(page.getByText('Featured · last logged')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /to favourites$/ })).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-recipes-list-old-db', ctx);
  await page.getByRole('button', { name: 'Open Big breakfast' }).click();
  await page.getByTestId('recipe-detail').getByRole('button', { name: 'Edit recipe' }).click();
  await expect(page.getByLabel('Prep time (minutes, optional)')).toHaveCount(0);
  await expect(page.getByLabel('Tags (optional)')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
});

test('a recipe that does not exist says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await page.goto('/recipes/nope');
  await expect(page.getByText(/couldn't find that recipe/)).toBeVisible();
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`recipes list and a recipe page fit every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(150000);
    const ctx = await openApp({ page, context }, testInfo, { ...BACKEND, profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto('/recipes'); await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} list: ${p.check} — ${p.msg}`);
      await page.goto('/recipes/r1'); await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} photo page: ${p.check} — ${p.msg}`);
      await page.goto('/recipes/r2'); await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} no-photo page: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
