import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// The dashboard bell: only for people with a coach; lists what the coach has
// sent; an unread dot until it's opened; a general note opens the chat.
const TRAINER = 'trainer-0000-0000-0000-000000000001';
const LINK = { id: 'link1', status: 'active', created_at: '2026-09-01T00:00:00Z', consented_at: '2026-09-01T00:00:00Z', referred_by_name: null, trainer_id: TRAINER, trainer_name: 'Sam Rivers', trainer_logo_url: null };
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const COMMENTS = [
  { id: 'c1', trainer_id: TRAINER, client_id: USER_ID, category: 'general', sender_role: 'trainer', body: 'Great week — keep the protein up.', comment_date: null, created_at: iso(0.2) },
  { id: 'c2', trainer_id: TRAINER, client_id: USER_ID, category: 'weight', sender_role: 'trainer', body: 'Weight is trending nicely.', comment_date: null, created_at: iso(2) },
  { id: 'c3', trainer_id: TRAINER, client_id: USER_ID, category: 'general', sender_role: 'client', body: 'Thanks coach!', comment_date: null, created_at: iso(1) },
];

for (const theme of ['light', 'dark']) {
  test(`dashboard · coach bell · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme }, rpc: { get_my_coach_links: [LINK] }, tables: { trainer_comments: COMMENTS } });
    await page.goto('/dashboard');
    await settle(page);

    const bell = page.getByRole('button', { name: /Messages from your coach/ });
    await expect(bell).toBeVisible();
    await expect(page.getByTestId('coach-unread-dot')).toBeVisible();
    await expect(bell).toHaveAccessibleName(/2 new/); // the client's own reply isn't counted
    await assertLayout(page, testInfo, `x-coach-bell-header-${theme}`, ctx);

    await bell.click();
    const sheet = page.getByText('Coach messages');
    await expect(sheet).toBeVisible();
    await expect(page.getByText('Great week — keep the protein up.')).toBeVisible();
    await expect(page.getByText('Weight is trending nicely.')).toBeVisible();
    await expect(page.getByText('Thanks coach!')).toHaveCount(0);
    await page.screenshot({ path: `e2e/screens/${testInfo.project.name}/x-coach-inbox-${theme}.png` });
    await assertLayout(page, testInfo, `x-coach-inbox-${theme}`, ctx);

    // Tapping a general note opens the chat with that coach.
    await page.getByText('Great week — keep the protein up.').click();
    await expect(page.getByText('Write a reply…', { exact: false }).or(page.getByPlaceholder('Write a reply…'))).toBeVisible();
  });
}

test('dashboard · the unread dot clears once the bell has been opened', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { get_my_coach_links: [LINK] }, tables: { trainer_comments: COMMENTS } });
  await page.goto('/dashboard');
  await settle(page);
  await expect(page.getByTestId('coach-unread-dot')).toBeVisible();
  await page.getByRole('button', { name: /Messages from your coach/ }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('coach-unread-dot')).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(page.getByTestId('coach-unread-dot')).toHaveCount(0);
});

test('dashboard · no bell without a coach', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await expect(page.getByRole('button', { name: /Messages from your coach/ })).toHaveCount(0);
});
