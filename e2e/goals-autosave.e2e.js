import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Settings → Goals saves on its own (no Save button). Real browser, fake backend.
const PROFILE = { goal: 'lose', pace_kg_per_week: 0.5, target_weight: 70, calorie_mode: 'calculated', sex: 'female' };
const profileWrites = (page) => {
  const writes = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/profiles') && r.method() !== 'GET') writes.push(JSON.parse(r.postData() || '{}')); });
  return writes;
};

test('goals autosave: a changed rate is written without pressing anything', async ({ page, context }, testInfo) => {
  test.skip(!['phone', 'desktop'].includes(testInfo.project.name), 'two viewports are enough');
  await openApp({ page, context }, testInfo, { profile: PROFILE });
  const writes = profileWrites(page);
  await page.goto('/settings/goals');
  await settle(page);
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
  await page.getByLabel('Weekly rate').fill('0.75');
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 5000 });
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ pace_kg_per_week: 0.75, goal: 'lose' });
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 5000 }); // flash goes away
});

test('goals autosave: a rejected save says why and the layout holds', async ({ page, context }, testInfo) => {
  test.skip(!['phone', 'small-phone', 'desktop'].includes(testInfo.project.name), 'phone sizes + desktop');
  const ctx = await openApp({ page, context }, testInfo, { profile: PROFILE });
  await context.route('**/rest/v1/profiles*', (route) => route.request().method() === 'GET'
    ? route.fallback()
    : route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "profiles"' }) }));
  await page.goto('/settings/goals');
  await settle(page);
  await page.getByLabel('Weekly rate').fill('0.75');
  const status = page.getByRole('status');
  await expect(status).toContainText("Couldn't save your changes", { timeout: 5000 });
  await expect(status).toContainText('row-level security');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  // console.error from the (expected) failure is the app logging it, not a bug
  await assertLayout(page, testInfo, 'goals-save-error', { ...ctx, consoleErrors: ctx.consoleErrors.filter((e) => !/Saving goals failed|status of 400/.test(e)) });
});
