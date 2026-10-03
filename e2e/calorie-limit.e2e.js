import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Temporary calorie limit (Pro): the settings card, and the dashboard showing
// it. Dates are built from the app's own timezone so "today" matches.
const iso = (offset = 0) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const RUNNING = [{ id: 'lim1', start: iso(-3), end: iso(10), calories: 1700, created_at: new Date().toISOString() }];

for (const theme of ['dark', 'light']) {
  test(`settings · start a limit · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    await page.goto('/settings/goals');
    await settle(page);
    const card = page.getByText('Temporary calorie limit', { exact: true });
    await card.scrollIntoViewIfNeeded();
    const cal = page.getByLabel('Calories a day');
    await expect(cal).toHaveValue('1800'); // usual 2100, minus about 300
    await cal.fill('1700');
    await page.getByRole('button', { name: '2 weeks' }).click();
    await expect(page.getByText(/Today until/)).toBeVisible();
    await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-limit-card-form-${theme}.png` });
    await assertLayout(page, testInfo, `x-limit-form-${theme}`, ctx);

    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/profiles') && r.method() !== 'GET' && (r.postData() || '').includes('calorie_limit_periods'));
    await page.getByRole('button', { name: 'Start limit' }).click();
    const body = JSON.parse((await write).postData());
    const periods = (Array.isArray(body) ? body[0] : body).calorie_limit_periods;
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ start: iso(0), end: iso(13), calories: 1700 });

    // The card flips to the running state.
    await expect(page.getByText(/14 days left/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'End limit early' })).toBeVisible();
    await page.getByText('Temporary calorie limit', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-limit-card-running-${theme}.png` });
    await assertLayout(page, testInfo, `x-limit-running-${theme}`, ctx);
  });
}

test('settings · a too-low number is refused with a reason', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/settings/goals');
  await settle(page);
  await page.getByLabel('Calories a day').fill('900');
  await page.getByRole('button', { name: 'Start limit' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /lowest limit/ })).toBeVisible();
});

test('settings · not Pro shows the locked card', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { profile: { is_premium: false, coach_pass: false, trial_ends_at: null } });
  await page.goto('/settings/goals');
  await settle(page);
  await expect(page.getByText('Temporary calorie limit', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Calories a day')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Upgrade to Pro/ }).first()).toBeVisible();
  await assertLayout(page, testInfo, 'x-limit-locked', ctx);
});

test('dashboard · a running limit shows a banner and becomes the target', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { profile: { calorie_limit_periods: RUNNING } });
  await page.goto('/dashboard');
  await settle(page);
  const banner = page.getByRole('status').filter({ hasText: 'kcal limit' });
  await expect(banner).toContainText('1,700 kcal limit');
  await expect(banner).toContainText('11 days left');
  // Today's card measures against the limit, not the usual 2,100.
  await expect(page.getByText('/ 1,700 kcal')).toBeVisible();
  await assertLayout(page, testInfo, 'x-limit-dashboard', ctx);

  await banner.getByRole('button', { name: 'Manage' }).click();
  await expect(page).toHaveURL(/\/settings\/goals/);
  await expect(page.getByRole('button', { name: 'End limit early' })).toBeVisible();
});

test('dashboard · no banner and the usual target without a limit', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await expect(page.getByRole('status').filter({ hasText: 'kcal limit' })).toHaveCount(0);
  await expect(page.getByText('/ 2,100 kcal')).toBeVisible();

});

test('dashboard · a limit is ignored when the account is not Pro', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { profile: { is_premium: false, coach_pass: false, trial_ends_at: null, calorie_limit_periods: RUNNING } });
  await page.goto('/dashboard');
  await settle(page);
  await expect(page.getByRole('status').filter({ hasText: 'kcal limit' })).toHaveCount(0);
  await expect(page.getByText('/ 2,100 kcal')).toBeVisible();
});
