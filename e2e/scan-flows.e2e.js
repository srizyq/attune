import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Scans: several menu dishes at once, a photo meal saved whole (with its
// ingredients), and a barcode scanned while building a recipe.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const goFood = async (page, state) => {
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate((usr) => {
    window.history.pushState({ usr, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, state);
};
const foodLogPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};

const MENU = {
  recommendations: [
    { name: 'Grilled chicken salad', items: 'Chicken, leaves, dressing on the side', cal: 420, protein: 38, carbs: 14, fat: 22, confidence: 'high' },
  ],
  items: [
    { name: 'Beef burger', description: 'With chips', section: 'Mains', cal: 980, protein: 42, carbs: 80, fat: 52 },
    { name: 'Fish and chips', description: '', section: 'Mains', cal: 860, protein: 36, carbs: 70, fat: 44 },
    { name: 'Garden salad', description: '', section: 'Sides', cal: 120, protein: 3, carbs: 10, fat: 7 },
  ],
};

test('menu scan: tick several dishes and add them together as separate entries', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await page.route('**/api/recognize-menu', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MENU) }));
  await goFood(page, { openMenuScan: true });
  await page.getByRole('button', { name: 'Take photo' }).click();

  // Nothing ticked yet: no Add button.
  await expect(page.getByRole('button', { name: /^Add \d+ item/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select Grilled chicken salad' }).click();
  await page.getByText('All items', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Beef burger' }).click();
  await page.getByRole('checkbox', { name: 'Select Garden salad' }).click();
  const add = page.getByRole('button', { name: /^Add 3 items/ });
  await expect(add).toBeVisible();
  await expect(add).toContainText('+1520 kcal'); // 420 + 980 + 120
  await assertLayout(page, testInfo, 'x-menu-scan-multi', ctx);

  // Unticking one updates the count.
  await page.getByRole('checkbox', { name: 'Select Garden salad' }).click();
  await expect(page.getByRole('button', { name: /^Add 2 items/ })).toContainText('+1400 kcal');

  await page.getByRole('button', { name: /^Add 2 items/ }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts.map((p) => p.food_name).sort()).toEqual(['Beef burger', 'Grilled chicken salad']);
  expect(posts.every((p) => p.source === 'menu' && p.meal === posts[0].meal)).toBe(true);
});

test('menu scan: tapping a dish still opens its own review', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/api/recognize-menu', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JSON.parse(route.request().postData() || '{}').detail ? {} : MENU) }));
  await goFood(page, { openMenuScan: true });
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.getByText('Grilled chicken salad').click();
  await expect(page.getByRole('button', { name: /Confirm & log/ })).toBeVisible();
});

const SCAN = {
  name: 'Croissant with pistachio cream', portion: '1 croissant', confidence: 'medium',
  ingredients: [
    { name: 'Croissant pastry base', grams: 80, cal: 320, protein: 6, carbs: 34, fat: 18 },
    { name: 'Pistachio cream filling/topping', grams: 30, cal: 160, protein: 4, carbs: 12, fat: 11 },
    { name: 'Powdered sugar dusting', grams: 5, cal: 19, protein: 0, carbs: 5, fat: 0 },
  ],
};

test('photo scan: the whole meal is one entry that keeps its ingredients', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await page.route('**/api/recognize-food', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
  await goFood(page, { openPhotoScan: true });
  await page.getByRole('button', { name: 'Take photo' }).click();
  // The AI's name is editable.
  const name = page.getByLabel('Meal name');
  await expect(name).toHaveValue('Croissant with pistachio cream');
  await name.fill('Breakfast croissant');
  await page.getByRole('button', { name: /^Log to / }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ food_name: 'Breakfast croissant', calories: 499, source: 'photo', serving_grams: 115 });
  expect(posts[0].ingredients).toHaveLength(3);
  expect(posts[0].ingredients[0]).toMatchObject({ name: 'Croissant pastry base', grams: 80, cal: 320 });
});

test('a logged photo meal shows its ingredients when it is opened', async ({ page, context }, testInfo) => {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await openApp({ page, context }, testInfo, {
    tables: { food_logs: [{
      id: 'f1', user_id: '00000000-0000-4000-8000-00000000d3m0', logged_date: ymd, meal: 'breakfast', food_name: 'Breakfast croissant',
      calories: 499, protein_g: 10, carbs_g: 51, fat_g: 29, fibre_g: 0, sodium_mg: 0, sugar_g: 0, serving_grams: 115, source: 'photo',
      ingredients: [{ name: 'Croissant pastry base', grams: 80, cal: 320 }, { name: 'Pistachio cream', grams: 30, cal: 160 }],
      created_at: new Date().toISOString(),
    }] },
  });
  await page.goto('/log');
  await settle(page);
  await expect(page.getByText(/2 ingredients/)).toBeVisible();
  await page.getByText('Breakfast croissant').first().click();
  const sheet = page.getByRole('dialog', { name: 'Breakfast croissant' });
  await expect(sheet.getByText('Croissant pastry base')).toBeVisible();
  await expect(sheet.getByText('Pistachio cream')).toBeVisible();
  await expect(sheet.getByText('160 cal')).toBeVisible();
});

test('barcode scanned while building a recipe goes into the recipe, not the daily log', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    tables: { barcode_products: [{ barcode: '9310000000019', name: 'Greek yoghurt', brand: 'Chobani', serving: '1 tub (170g)', calories: 120, protein_g: 11, carbs_g: 8, fat_g: 4, fibre_g: 0, sodium_mg: 60, sugar_g: 6, serving_grams: 170, serving_unit: 'g' }] },
  });
  const posts = foodLogPosts(page);
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  await goFood(page, { openMealBuilder: true, openScan: true });
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('9310000000019');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Greek yoghurt').first()).toBeVisible();
  // The button says what it does, and there is no meal to pick.
  await expect(page.getByRole('button', { name: 'Add to recipe' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add to (breakfast|lunch|dinner|snacks)/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to recipe' }).click();

  // Back on the recipe screen: clearly in recipe mode, with the item in it.
  await expect(page.getByText("You're building a recipe")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await expect(page.getByText(/Building recipe · 1 item/)).toBeVisible();
  await expect(page.getByText(/Adding to:/)).toHaveCount(0);
  expect(posts).toHaveLength(0);
  await assertLayout(page, testInfo, 'x-recipe-mode', ctx);
});
