import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';

// Profile = name/units/body stats (autosaved); Account = plan, theme, sign out;
// Delete account is its own page — no popups on any of them.

test('Settings → Profile has the personal details, Account does not', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {});
  await page.goto('/settings');
  await settle(page);
  await page.getByRole('button', { name: /Alex Morgan/ }).first().click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Weight')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);

  await page.goto('/settings');
  await settle(page);
  await page.getByRole('button', { name: /Account/ }).first().click();
  await expect(page).toHaveURL(/\/settings\/personal$/);
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await expect(page.getByLabel('Weight')).toHaveCount(0);
});

test('Delete account is a page, needs DELETE typed, and Cancel goes back', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {});
  await page.goto('/settings/personal');
  await settle(page);
  await page.getByRole('button', { name: /Delete/ }).click();
  await expect(page).toHaveURL(/\/settings\/personal\/delete$/);
  const go = page.getByRole('button', { name: 'Delete forever' });
  await expect(go).toBeDisabled();
  await page.getByLabel(/Type DELETE/).fill('DELETE');
  await expect(go).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/settings\/personal$/);
});

test('Log weight is a page: saves a weight and returns to where you came from', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, {});
  await page.goto('/expenditure');
  await settle(page);
  await page.getByRole('button', { name: /Log weight/ }).first().click();
  await expect(page).toHaveURL(/\/weight\/log$/);
  const writes = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/weight_logs') && r.method() !== 'GET') writes.push(r.postData()); });
  await page.getByLabel(/Weight \(/).fill('81.2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/expenditure$/);
  expect(writes.join('')).toContain('81.2');
});
