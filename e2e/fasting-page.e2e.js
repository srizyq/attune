import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';
import { USER_ID } from './fixtures.js';

// Fasting: start with a protocol, then a ring with a rough "where you might be"
// stage, a changeable goal, a streak, and a seven-day consistency row.
const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const row = (id, startedHoursAgo, ranHours, target = 16) => ({
  id, user_id: USER_ID, started_at: ago(startedHoursAgo), target_hours: target,
  ended_at: ago(startedHoursAgo - ranHours), end_notified_at: null, created_at: ago(startedHoursAgo),
});
const running = (hours, target = 16) => ({ id: 'run', user_id: USER_ID, started_at: ago(hours), target_hours: target, ended_at: null, end_notified_at: '2026-01-01T00:00:00Z', created_at: ago(hours) });
// Fasts that ended 1 and 2 days ago (goal met), 4 days ago (ended short).
const HISTORY = [row('h1', 24 + 16, 16), row('h2', 48 + 16, 17), row('h3', 96 + 12, 9)];

const writes = (page) => {
  const seen = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('/rest/v1/fasts') && ['PATCH', 'POST'].includes(r.method())) seen.push({ method: r.method(), body: JSON.parse(r.postData() || '{}') }); });
  return seen;
};

for (const theme of ['dark', 'light']) {
  test(`fasting · start screen with week and history · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { tables: { fasts: HISTORY }, profile: { theme } });
    await page.goto('/fasting');
    await settle(page);
    await expect(page.getByText('Start a fast')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start 16h fast' })).toBeVisible();
    await expect(page.getByText('2 day streak')).toBeVisible();
    await expect(page.getByText('Goal met 2 of 7 days')).toBeVisible();
    await expect(page.getByTestId('fast-week').getByRole('img')).toHaveCount(7);
    await expect(page.getByTestId('fast-week').locator('[data-state="met"]')).toHaveCount(2);
    await expect(page.getByTestId('fast-week').locator('[data-state="short"]')).toHaveCount(1);
    await assertLayout(page, testInfo, `x-fasting-start-${theme}`, ctx);
  });

  test(`fasting · running fast with stage, goal controls and streak · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { tables: { fasts: [running(9), ...HISTORY] }, profile: { theme } });
    await page.goto('/fasting');
    await settle(page);
    await expect(page.getByLabel('Time fasted')).toHaveText(/^9:0\d:\d\d$/);
    await expect(page.getByTestId('fast-stage')).toHaveText('Fasting');
    await expect(page.getByText(/Next: Extended fast in/)).toBeVisible();
    await expect(page.getByText(/rough guide only/)).toBeVisible();
    await assertLayout(page, testInfo, `x-fasting-running-${theme}`, ctx);
  });
}

test('picking another protocol while fasting changes the goal and re-arms the end notification', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { fasts: [running(5)] }, persist: ['fasts'] });
  const seen = writes(page);
  await page.goto('/fasting');
  await settle(page);
  await expect(page.getByText('of your 16h goal')).toBeVisible();
  await page.getByRole('group', { name: 'Change goal' }).getByRole('button', { name: '18:6' }).click();
  await expect(page.getByText('of your 18h goal')).toBeVisible();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ method: 'PATCH', body: { target_hours: 18, end_notified_at: null } });
});

test('"2 more hours" extends the goal', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { fasts: [running(5)] }, persist: ['fasts'] });
  const seen = writes(page);
  await page.goto('/fasting');
  await settle(page);
  await page.getByRole('button', { name: /2 more hours/ }).click();
  await expect(page.getByText('of your 18h goal')).toBeVisible();
  expect(seen[0].body.target_hours).toBe(18);
});

test('a custom goal while fasting waits for "Set goal" — typing never rewrites it', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { fasts: [running(5)] }, persist: ['fasts'] });
  const seen = writes(page);
  await page.goto('/fasting');
  await settle(page);
  await page.getByRole('group', { name: 'Change goal' }).getByRole('button', { name: 'Custom' }).click();
  await page.getByLabel('Fast length in hours').pressSequentially('22');
  expect(seen).toHaveLength(0);
  await page.getByRole('button', { name: 'Set goal' }).click();
  await expect(page.getByText('of your 22h goal')).toBeVisible();
  expect(seen[0].body.target_hours).toBe(22);
});

test('a finished goal is shown as reached; extending it carries on fasting', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { fasts: [running(17)] }, persist: ['fasts'] });
  await page.goto('/fasting');
  await settle(page);
  await expect(page.getByText('Goal reached').first()).toBeVisible();
  await page.getByRole('button', { name: /2 more hours/ }).click();
  await expect(page.getByText('Fasting', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/to go/)).toBeVisible();
});

test('the extend button is gone at the 72 hour limit', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { tables: { fasts: [running(5, 72)] } });
  await page.goto('/fasting');
  await settle(page);
  await expect(page.getByRole('button', { name: /2 more hours/ })).toHaveCount(0);
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  for (const [label, fasts] of [['not fasting', HISTORY], ['mid-fast', [running(9), ...HISTORY]]]) {
    test(`fasting fits every device size · ${label} · ${theme}`, async ({ page, context }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
      test.setTimeout(150000);
      const ctx = await openApp({ page, context }, testInfo, { tables: { fasts }, profile: { theme } });
      const problems = [];
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.goto('/fasting'); await settle(page);
        for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height}: ${p.check} — ${p.msg}`);
      }
      expect(problems).toEqual([]);
      expect(ctx.consoleErrors).toEqual([]);
    });
  }
}
