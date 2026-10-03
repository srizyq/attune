import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Restaurant items the chain published per serving (no weight) can only be
// logged by serving — offering grams would be a made-up conversion.
const row = (id, name, grams) => ({ id: `mcdonalds-au_${id}`, chain_id: 'mcdonalds-au', chain_name: "McDonald's", name, category: 'Burgers', size_label: null, serving_label: grams ? `1 burger (${grams}g)` : '1 burger', serving_grams: grams, calories: 540, protein_g: 30, carbs_g: 40, fat_g: 28, fibre_g: null, sodium_mg: 900, sugar_g: 8 });
const BACKEND = {
  tables: {
    restaurant_chains: [{ id: 'mcdonalds-au', name: "McDonald's", country: 'AU', category: 'burgers' }],
    restaurant_items: [row('weighed', 'Weighed Burger', 219), row('unweighed', 'Unweighed Burger', null)],
  },
};

async function openItem(page, name) {
  await page.goto('/food');
  await settle(page);
  await page.getByPlaceholder(/Search any food/).fill('maccas');
  await page.getByRole('button', { name: /McDonald's/ }).click();
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(300);
}
// The unit picker is a <select>; read its option labels.
const unitOptions = (page) => page.locator('select').filter({ has: page.locator('option', { hasText: 'serving' }) }).first().locator('option').allTextContents();

test('a restaurant item with a published weight offers weight units', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, BACKEND);
  await openItem(page, 'Weighed Burger');
  expect(await unitOptions(page)).toEqual(expect.arrayContaining(['serving', 'g', 'oz']));
});

test('a restaurant item with no published weight is counted in servings only', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, BACKEND);
  await openItem(page, 'Unweighed Burger');
  expect(await unitOptions(page)).toEqual(['serving']);
  await assertLayout(page, testInfo, 'x-restaurant-no-weight', ctx);
});
