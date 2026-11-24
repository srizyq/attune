import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// While a screen's data is on its way it shows grey placeholder shapes instead
// of a blank page. Each test holds the request back, checks the placeholder is
// there and fits the screen, then lets the data through and checks it is gone.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const ENTRY = {
  id: 'e1', user_id: USER_ID, logged_date: TODAY, meal: 'snacks', food_name: 'Vanilla Greek Yogurt', brand: 'Chobani', calories: 114, protein_g: 20.1, carbs_g: 7, fat_g: 0.4,
  serving_grams: 170, source: 'search', logged_amount: 1, logged_unit: 'serving', logged_at: new Date().toISOString(), created_at: new Date().toISOString(), slot_id: null,
};

// Hold every request whose URL matches until release() is called.
function hold(page, match) {
  let release;
  const gate = new Promise((r) => { release = r; });
  return page.route(match, async (route) => { await gate; await route.fallback(); }).then(() => release);
}

const SCREENS = [
  { name: 'daily-log', url: `/log?date=${TODAY}`, table: '**/rest/v1/food_logs*', label: 'Loading your day', ready: (p) => expect(p.getByText('Vanilla Greek Yogurt').first()).toBeVisible() },
  { name: 'entry-editor', url: `/log/item/e1?date=${TODAY}`, table: '**/rest/v1/food_logs*', label: 'Loading entry', ready: (p) => expect(p.getByRole('heading', { level: 1 })).toHaveText('Vanilla Greek Yogurt') },
  { name: 'recipes', url: '/recipes', table: '**/rest/v1/saved_meals*', label: 'Loading recipes', ready: (p) => expect(p.getByText('Big breakfast').first()).toBeVisible() },
];

for (const theme of ['dark', 'light']) {
  for (const s of SCREENS) {
    test(`skeleton · ${s.name} shows placeholders while loading, then the content · ${theme}`, async ({ page, context }, testInfo) => {
      await openApp({ page, context }, testInfo, { tables: { food_logs: [ENTRY] }, profile: { theme } });
      const release = await hold(page, s.table);
      await page.goto(s.url);
      const sk = page.getByRole('status', { name: s.label });
      await expect(sk).toBeVisible();
      expect(await sk.locator('.skeleton').count()).toBeGreaterThan(2);
      await assertLayout(page, testInfo, `skeleton-${s.name}-${theme}`, { scroll: false });
      release();
      await s.ready(page);
      await settle(page);
      await expect(page.getByRole('status', { name: s.label })).toHaveCount(0);
    });
  }
}

test('skeleton · the shimmer stills when the device asks for reduced motion', async ({ page, context }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp({ page, context }, testInfo, { tables: { food_logs: [ENTRY] } });
  await hold(page, '**/rest/v1/food_logs*');
  await page.goto(`/log?date=${TODAY}`);
  const block = page.getByRole('status', { name: 'Loading your day' }).locator('.skeleton').first();
  await expect(block).toBeVisible();
  expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
