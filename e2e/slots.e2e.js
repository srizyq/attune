import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';
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
