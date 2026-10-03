import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Editing a saved recipe inside its own sheet (amounts, remove, rename,
// servings), with Save / Cancel pinned above the nav bar.
async function openEditor(page) {
  await page.goto('/recipes');
  await settle(page);
  await page.getByText('Chicken and rice').first().click();
  await page.getByRole('button', { name: 'Edit recipe' }).click();
  await page.getByRole('heading', { name: 'Edit recipe' }).or(page.getByText('Edit recipe', { exact: true })).first().waitFor();
  await page.waitForTimeout(300);
}

for (const theme of ['dark', 'light']) {
  test(`recipe editor · changing an amount saves it · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    await openEditor(page);

    // Save and Cancel are reachable (not under the nav) at the bottom of the sheet.
    for (const name of ['Save changes', 'Cancel']) {
      const btn = page.getByRole('button', { name, exact: true });
      const hit = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { onTop: el.contains(top), nav: !!top?.closest?.('.app-bottom-nav') };
      });
      expect(hit.nav, `${name} under nav`).toBe(false);
      expect(hit.onTop, `${name} on top`).toBe(true);
    }

    // 200g chicken -> 100g halves its calories; 2 servings -> per serving unchanged maths.
    const amount = page.getByLabel('Amount of Chicken breast');
    await expect(amount).toHaveValue('200');
    await amount.fill('100');
    await expect(page.getByTestId('per-serving')).toContainText('kcal per serving');
    await assertLayout(page, testInfo, `x-recipe-editor-${theme}`, ctx);

    const saved = page.waitForRequest((r) => r.url().includes('/rest/v1/saved_meals') && ['PATCH', 'POST', 'PUT'].includes(r.method()));
    await page.getByRole('button', { name: 'Save changes' }).click();
    const body = JSON.parse((await saved).postData());
    const chicken = (Array.isArray(body) ? body[0] : body).items.find((i) => i.name === 'Chicken breast');
    expect(chicken).toMatchObject({ loggedAmount: 100, loggedUnit: 'g', servingGrams: 100, cal: 165 });
    // (The fake backend answers a write with a new id, which closes the sheet
    // — so the visible confirmation is the toast, not the sheet.)
    await expect(page.getByText('Chicken and rice updated')).toBeVisible();
  });
}

test('recipe editor · remove an ingredient and cancel leaves the recipe alone', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await openEditor(page);
  await page.getByRole('button', { name: 'Remove Jasmine rice' }).click();
  await expect(page.getByLabel('Amount of Jasmine rice')).toHaveCount(0);
  let wrote = false;
  page.on('request', (r) => { if (r.url().includes('/rest/v1/saved_meals') && r.method() !== 'GET') wrote = true; });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Jasmine rice').first()).toBeVisible();
  expect(wrote).toBe(false);
});

test('recipe editor · Add ingredient goes to food search carrying the edits', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await openEditor(page);
  await page.getByLabel('Amount of Chicken breast').fill('150');
  await page.getByRole('button', { name: /Add ingredient/ }).click();
  await expect(page).toHaveURL(/\/food/);
  await expect(page.getByText(/Building recipe · 2 items/)).toBeVisible();
});
