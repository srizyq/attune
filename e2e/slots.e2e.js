import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// Slots mode (Pro): food added to a slot lands in that slot, whichever way it is
// added; foods can be moved between slots and Uncategorised.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const slot = (id, label, time, order = 0) => ({ id, user_id: USER_ID, logged_date: TODAY, label, slot_time: `${time}:00`, sort_order: order, target_calories: null, target_protein_g: null, target_carbs_g: null, target_fat_g: null });
const SLOTS = [slot('s-morning', 'Morning Fuel', '08:30'), slot('s-lunch', 'Lunch Break', '12:30', 1)];
const log = (id, name, over = {}) => ({
  id, user_id: USER_ID, logged_date: TODAY, meal: 'lunch', food_name: name, calories: 200, protein_g: 10, carbs_g: 20, fat_g: 6, fibre_g: 1, sodium_mg: 50, sugar_g: 2,
  serving_grams: 100, source: 'ausnut', logged_amount: 100, logged_unit: 'g', logged_at: new Date().toISOString(), created_at: new Date().toISOString(), slot_id: null, ...over,
});
const POTATO = { id: 3, name: 'Potato, peeled, raw', derivation: 'x', calories: 80, protein_g: 2, carbs_g: 17, fat_g: 0.1, fibre_g: 2, sodium_mg: 5, sugar_g: 1 };
const PRO = { profile: { is_premium: true, daily_log_view: 'slots' } };

const foodPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};
const slotWrites = (page) => {
  const writes = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'PATCH') writes.push(JSON.parse(r.postData() || '{}')); });
  return writes;
};

test('searching and adding from a slot logs the food into that slot', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { ...PRO, tables: { day_slots: SLOTS, food_logs: [] }, rpc: { search_ausnut_foods_ranked: [POTATO] } });
  const posts = foodPosts(page);
  await page.goto('/log');
  await settle(page);
  await page.getByRole('button', { name: '+ Log Lunch Break' }).click();
  await page.getByPlaceholder(/Search any food/).fill('potato');
  await page.getByText('Potato, peeled, raw').first().click();
  await page.getByRole('button', { name: /^Add/ }).last().click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].slot_id).toBe('s-lunch');
});

test('a barcode scanned from a slot logs into that slot', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { ...PRO, tables: { day_slots: SLOTS, food_logs: [], barcode_products: [{ barcode: '9310000000019', name: 'Greek yoghurt', brand: 'Chobani', serving: '1 tub (170g)', calories: 120, protein_g: 11, carbs_g: 8, fat_g: 4, fibre_g: 0, sodium_mg: 60, sugar_g: 6, serving_grams: 170, serving_unit: 'g' }] } });
  await page.route('**/world.openfoodfacts.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 0 }) }));
  const posts = foodPosts(page);
  await page.goto('/scan/barcode', { waitUntil: 'domcontentloaded' });
  await page.evaluate((id) => {
    window.history.pushState({ usr: { date: undefined, presetSlotId: id, presetTime: '12:30' }, key: 'scan', idx: 1 }, '', '/scan/barcode');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, 's-lunch');
  await settle(page);
  await page.getByRole('button', { name: /Enter barcode manually/ }).click();
  await page.getByPlaceholder(/barcode/i).fill('9310000000019');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByTestId('barcode-result').getByRole('button', { name: /^Log \d+ kcal at / }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].slot_id).toBe('s-lunch');
});

// ── Moving foods between slots ──────────────────────────────────────────────
const FOODS = [
  log('f-oats', 'Oats', { calories: 300, slot_id: 's-morning' }),
  log('f-egg', 'Boiled egg', { calories: 140 }),
  log('f-rice', 'Rice bowl', { calories: 420 }),
];
const openLog = async (page, testInfo, context, extra = {}) => {
  const ctx = await openApp({ page, context }, testInfo, { ...PRO, tables: { day_slots: SLOTS, food_logs: FOODS, ...extra } });
  await page.goto('/log');
  await settle(page);
  return ctx;
};
const segment = (page, name) => page.locator('[data-drop-slot]').filter({ hasText: name }).first();

test('Uncategorised is called Uncategorised, and foods can be ticked and moved into an existing slot', async ({ page, context }, testInfo) => {
  const ctx = await openLog(page, testInfo, context);
  await assertLayout(page, testInfo, 'x-slots-list', ctx);
  const patches = slotWrites(page);
  await expect(page.getByText(/^Uncategorised · /)).toBeVisible();
  await expect(page.getByText(/Unsorted/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Select foods' }).click();
  await page.getByRole('checkbox', { name: 'Select Boiled egg' }).check();
  await page.getByRole('checkbox', { name: 'Select Rice bowl' }).check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await assertLayout(page, testInfo, 'x-slots-selecting', ctx);
  await page.getByRole('button', { name: 'Move to slot' }).click();
  await page.getByRole('dialog', { name: 'Move to slot' }).getByRole('button', { name: /Lunch Break/ }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ slot_id: 's-lunch' });
  // Both are in Lunch Break now, which shows their total; Uncategorised is gone.
  await expect(page.getByRole('toolbar', { name: 'Selected foods' })).toHaveCount(0);
  await expect(segment(page, 'Lunch Break')).toContainText('560 kcal');
  await expect(page.getByText(/^Uncategorised · /)).toHaveCount(0);
});

test('select foods, then group them into a brand new slot', async ({ page, context }, testInfo) => {
  await openLog(page, testInfo, context);
  const patches = slotWrites(page);
  const created = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/day_slots') && r.method() === 'POST') created.push(JSON.parse(r.postData() || '{}')); });
  await page.getByRole('button', { name: 'Select foods' }).click();
  await page.getByRole('checkbox', { name: 'Select Boiled egg' }).check();
  await page.getByRole('button', { name: 'New slot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Group into new slot' });
  await expect(dialog.getByRole('button', { name: 'Create slot' })).toBeDisabled();
  await dialog.getByLabel('Slot name').fill('Pre-workout');
  await dialog.getByLabel('Time').fill('07:15');
  await dialog.getByRole('button', { name: 'Create slot' }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ label: 'Pre-workout', slot_time: '07:15' });
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].slot_id).toBeTruthy();
  await expect(segment(page, 'Pre-workout')).toContainText('140 kcal');
});

test('a single food can be moved from its edit sheet', async ({ page, context }, testInfo) => {
  await openLog(page, testInfo, context);
  const patches = slotWrites(page);
  await page.getByText(/^Uncategorised · /).click();
  await page.getByText('Boiled egg').first().click();
  await page.getByLabel('Slot', { exact: true }).selectOption('s-morning');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches.at(-1).slot_id).toBe('s-morning');
});

test('dragging a food onto a slot moves it there', async ({ page, context }, testInfo) => {
  // A tall screen, so the food isn't under the quick-add bar pinned to the bottom.
  const { width } = page.viewportSize();
  await page.setViewportSize({ width, height: 1300 });
  await openLog(page, testInfo, context);
  const patches = slotWrites(page);
  await page.getByText(/^Uncategorised · /).click();
  const handle = page.getByRole('button', { name: 'Drag Boiled egg to another slot' });
  const from = await handle.boundingBox();
  const target = await segment(page, 'Morning Fuel').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 20, { steps: 8 });
  await expect(segment(page, 'Morning Fuel')).toHaveCSS('border-top-width', '2px'); // lit up as the drop target
  await page.mouse.up();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ slot_id: 's-morning' });
  await expect(segment(page, 'Morning Fuel')).toContainText('440 kcal');
});

test('dropping a food back where it already is does nothing', async ({ page, context }, testInfo) => {
  const { width } = page.viewportSize();
  await page.setViewportSize({ width, height: 1300 });
  await openLog(page, testInfo, context);
  const patches = slotWrites(page);
  await page.getByText(/^Uncategorised · /).click();
  const handle = page.getByRole('button', { name: 'Drag Boiled egg to another slot' });
  const from = await handle.boundingBox();
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 12, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(patches).toHaveLength(0);
});
