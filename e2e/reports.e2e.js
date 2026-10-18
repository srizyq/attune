import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { Buffer } from 'node:buffer';
import { USER_ID } from './fixtures.js';

// Settings → Report a problem, and the admin page where reports are reviewed.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function watch(page) {
  const seen = { rpc: [], notify: [], uploads: [] };
  page.on('request', (r) => {
    const url = r.url();
    if (url.includes('/rest/v1/rpc/submit_app_report')) seen.rpc.push(JSON.parse(r.postData() || '{}'));
    if (url.includes('/api/notify-trainer-comment')) seen.notify.push(JSON.parse(r.postData() || '{}'));
    if (url.includes('/storage/v1/object/report-screenshots')) seen.uploads.push(url);
  });
  return seen;
}

const REPORTS = [
  { id: 'r-1', user_id: USER_ID, message: 'The scan button does nothing on the food page', contact_email: 'alex@example.test', screen: '/food', app_version: 'abc1234', user_agent: 'Safari iPhone', viewport: '390x844', errors: ['TypeError: x is undefined'], screenshot_path: `${USER_ID}/a.jpg`, status: 'new', github_issue_url: 'https://github.com/o/r/issues/5', pr_url: null, admin_note: null, claude_requested_at: null, created_at: '2026-10-18T01:00:00Z' },
  { id: 'r-2', user_id: USER_ID, message: 'Typo on the pricing page', contact_email: null, screen: '/pricing', app_version: 'abc1234', user_agent: 'Chrome', viewport: '1280x800', errors: [], screenshot_path: null, status: 'new', github_issue_url: null, pr_url: null, admin_note: null, claude_requested_at: null, created_at: '2026-10-17T01:00:00Z' },
  { id: 'r-3', user_id: USER_ID, message: 'Old problem that was sorted', contact_email: null, screen: '/log', app_version: 'old', user_agent: 'Chrome', viewport: '1x1', errors: [], screenshot_path: null, status: 'fixed', github_issue_url: null, pr_url: null, admin_note: 'done', claude_requested_at: null, created_at: '2026-10-10T01:00:00Z' },
];

test('Settings has a Report a problem row that opens the form', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/settings');
  await settle(page);
  await expect(page.getByRole('button', { name: /Reports/ })).toHaveCount(0); // not an admin
  await page.getByRole('button', { name: /Report a problem/ }).click();
  await expect(page).toHaveURL(/\/settings\/report$/);
  await expect(page.getByLabel('What went wrong?')).toBeVisible();
  await assertLayout(page, testInfo, 'x-report-form', ctx);
});

test('the form needs a real message, then sends it with the screen, version and device', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const seen = watch(page);
  await page.goto('/food');
  await settle(page);
  await page.goto('/settings/report');
  const send = page.getByRole('button', { name: 'Send report' });
  await expect(send).toBeDisabled();
  await page.getByLabel('What went wrong?').fill('bug');
  await expect(send).toBeDisabled();
  await page.getByLabel('What went wrong?').fill('The scan button does nothing');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText("Thanks, we've got it")).toBeVisible();
  expect(seen.rpc).toHaveLength(1);
  expect(seen.rpc[0]).toMatchObject({ p_message: 'The scan button does nothing', p_contact_ok: true, p_screenshot_path: null });
  expect(seen.rpc[0].p_screen).toBe('/food'); // where they were, not the report page
  expect(seen.rpc[0].p_app_version).toBeTruthy();
  expect(seen.rpc[0].p_viewport).toMatch(/^\d+x\d+$/);
  expect(Array.isArray(seen.rpc[0].p_errors)).toBe(true);
  // The server is told so it can email and file the issue.
  await expect.poll(() => seen.notify.length).toBe(1);
  expect(seen.notify[0]).toEqual({ report: 'created', reportId: 'report-1' });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('the "email me" switch is sent, and a screenshot is uploaded into the person\'s own folder', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const seen = watch(page);
  await page.goto('/settings/report');
  await page.getByLabel('What went wrong?').fill('The calendar overlaps the header');
  await page.getByRole('switch', { name: /email me/ }).uncheck();
  await page.getByLabel('Screenshot (optional)').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText("Thanks, we've got it")).toBeVisible();
  expect(seen.uploads).toHaveLength(1);
  expect(seen.uploads[0]).toContain(`/report-screenshots/${USER_ID}/`);
  expect(seen.rpc[0].p_contact_ok).toBe(false);
  expect(seen.rpc[0].p_screenshot_path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));
});

test('hitting the daily limit says so and keeps what was written', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.route('**/rest/v1/rpc/submit_app_report', (route) => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'report_rate_limited' }) }));
  await page.goto('/settings/report');
  await page.getByLabel('What went wrong?').fill('One more problem to report');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('alert')).toContainText('Try again tomorrow');
  await expect(page.getByLabel('What went wrong?')).toHaveValue('One more problem to report');
});

test('someone who is not an admin cannot open the reports page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/admin/reports');
  await expect(page).toHaveURL(/\/settings$/);
});

test.describe('as an admin', () => {
  const ADMIN = { rpc: { is_app_admin: true }, tables: { app_reports: REPORTS } };

  test('Settings shows a Reports row, and the page lists open reports first', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, ADMIN);
    await page.goto('/settings');
    await settle(page);
    await page.getByRole('button', { name: /Reports/ }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.getByText('The scan button does nothing on the food page')).toBeVisible();
    await expect(page.getByText('Typo on the pricing page')).toBeVisible();
    await expect(page.getByText('Old problem that was sorted')).toHaveCount(0);
    await assertLayout(page, testInfo, 'x-admin-reports', ctx);
    await page.getByRole('tab', { name: 'Closed' }).click();
    await expect(page.getByText('Old problem that was sorted')).toBeVisible();
    await expect(page.getByText('The scan button does nothing on the food page')).toHaveCount(0);
  });

  test('changing the status and writing a note are saved', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, ADMIN);
    const patches = [];
    page.on('request', (r) => { if (r.url().includes('/rest/v1/app_reports') && r.method() === 'PATCH') patches.push(JSON.parse(r.postData() || '{}')); });
    await page.goto('/admin/reports');
    await settle(page);
    const card = page.locator('div').filter({ hasText: 'Typo on the pricing page' }).last();
    await card.getByLabel('Status').selectOption('wont_fix');
    await expect.poll(() => patches.some((p) => p.status === 'wont_fix')).toBe(true);
    await card.getByLabel('Note').fill('Not a bug');
    await card.getByLabel('Note').blur();
    await expect.poll(() => patches.some((p) => p.admin_note === 'Not a bug')).toBe(true);
  });

  test('Ask Claude to fix tells the server, and the button goes away', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, ADMIN);
    const seen = watch(page);
    await page.route('**/api/notify-trainer-comment', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, issueUrl: 'https://github.com/o/r/issues/5' }) }));
    await page.goto('/admin/reports');
    await settle(page);
    const card = page.locator('div').filter({ hasText: 'Typo on the pricing page' }).last();
    await card.getByRole('button', { name: 'Ask Claude to fix' }).click();
    await expect(page.getByText('Claude has been asked to draft a fix')).toBeVisible();
    expect(seen.notify).toEqual([{ report: 'claude', reportId: 'r-2' }]);
    await expect(card.getByRole('button', { name: 'Ask Claude to fix' })).toHaveCount(0);
  });

  test('the details and the screenshot can be opened', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, ADMIN);
    await page.goto('/admin/reports');
    await settle(page);
    await page.getByText('Details').first().click();
    await expect(page.getByText('TypeError: x is undefined')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Screenshot from the report' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'GitHub issue' })).toHaveAttribute('href', 'https://github.com/o/r/issues/5');
  });
});
