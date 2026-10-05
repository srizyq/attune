import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';

test.describe('net carbs', () => {
  test('off: the Dashboard and Nutrients say Carbs', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { profile: { net_carbs: false } });
    await page.goto('/dashboard');
    await settle(page);
    await expect(page.getByText('CARBS', { exact: true })).toBeVisible();
    await expect(page.getByText('NET CARBS', { exact: true })).toHaveCount(0);
  });

  test('on: the Dashboard and Nutrients say Net carbs', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { profile: { net_carbs: true } });
    await page.goto('/dashboard');
    await settle(page);
    await expect(page.getByText('NET CARBS', { exact: true })).toBeVisible();
    await page.goto('/nutrients');
    await settle(page);
    await expect(page.getByText('Net carbs', { exact: true }).first()).toBeVisible();
  });

  test('Goals: choosing Keto sets the split and saves net carbs on', async ({ page, context }, testInfo) => {
    test.skip(!['phone', 'desktop'].includes(testInfo.project.name), 'two viewports are enough');
    await openApp({ page, context }, testInfo);
    const writes = [];
    page.on('request', (r) => { if (r.url().includes('/rest/v1/profiles') && r.method() !== 'GET') writes.push(JSON.parse(r.postData() || '{}')); });
    await page.goto('/settings/goals');
    await settle(page);
    await page.getByRole('button', { name: /^Keto/ }).click();
    await expect(page.getByLabel('Fat percent of calories')).toHaveText('70%');
    await expect(page.getByText('5% (auto)')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 5000 });
    const body = Array.isArray(writes.at(-1)) ? writes.at(-1)[0] : writes.at(-1);
    expect(body.net_carbs).toBe(true);
    expect(body.carbs_g).toBeLessThan(40);
  });
});
