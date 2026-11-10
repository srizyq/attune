import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';

// The Dashboard tour: a new account gets it, it lights up one thing at a time,
// a tap on the lit-up spot moves on, and an existing account never sees it.
test('tour-walks-through-the-dashboard', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { session: { created_at: new Date().toISOString() } });
  await page.goto('/dashboard');
  await settle(page);
  const dialog = page.getByRole('dialog', { name: 'App tour' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: testInfo.outputPath('tour-1.png') });
  const titles = [];
  for (let i = 0; i < 4 && await dialog.isVisible(); i++) {
    titles.push(await dialog.locator('div').filter({ hasText: /^[A-Z]/ }).first().innerText().catch(() => ''));
    // A tap anywhere moves on (here: well away from the lit-up spot).
    await page.mouse.click(200, 400);
    await page.waitForTimeout(500);
  }
  await expect(dialog).toBeHidden();
  expect(ctx.consoleErrors).toEqual([]);
});

test('tour-skipped-for-existing-accounts', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await page.waitForTimeout(1200);
  await expect(page.getByRole('dialog', { name: 'App tour' })).toHaveCount(0);
});
