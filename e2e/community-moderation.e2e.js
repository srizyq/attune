import { test, expect } from '@playwright/test';
import { openApp, assertLayout } from './harness.js';
import { ME } from './communityFixtures.js';

// The moderation page: only for moderators; shows what was reported; hide,
// delete, ban or dismiss.
const ON = { community_access: true };
const bodyOf = (req) => JSON.parse(req.postData() || '{}');
const report = (over = {}) => ({
  id: 'r1', status: 'open', reason: 'harassment', details: 'rude note', created_at: new Date(Date.now() - 3600e3).toISOString(),
  reporter_username: 'leo.p', reported_user_id: 'u-maya', reported_username: 'maya.k', reported_banned: false,
  post_id: 'p1', post_hidden: false,
  post_snapshot: { kind: 'meal', payload: { title: 'Chicken power bowl', calories: 640, protein_g: 46, carbs_g: 52, fat_g: 26 }, note: 'a note', photo_path: null },
  ...over,
});
const MOD = (rows) => ({ ...ON, community_is_moderator: true, community_mod_reports: (req) => rows.filter((r) => r.status === bodyOf(req).p_status) });
const rpcCall = (page, fn) => page.waitForRequest((r) => r.url().includes(`/rest/v1/rpc/${fn}`));

test('a moderator sees the reports with what was posted, and the shield on Community', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: MOD([report()]), tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await page.getByRole('button', { name: 'Moderation' }).click();
  await expect(page).toHaveURL(/\/community\/moderate/);
  const card = page.getByRole('article', { name: 'Report: Harassment or hate' });
  await expect(card.getByText('@maya.k reported by @leo.p')).toBeVisible();
  await expect(card.getByText('“rude note”')).toBeVisible();
  await expect(card.getByText('Chicken power bowl')).toBeVisible();
  await expect(card.getByText('640 kcal · P 46g · C 52g · F 26g')).toBeVisible();
  await expect(card.getByText('“a note”')).toBeVisible();
  await assertLayout(page, testInfo, 'x-community-moderation', ctx);
});

test('someone who is not a moderator is sent back, and has no shield', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Moderation' })).toHaveCount(0);
  await page.goto('/community/moderate');
  await expect(page).toHaveURL(/\/community$/);
});

test('hide a post, then dismiss another report', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: MOD([report(), report({ id: 'r2', reason: 'spam', post_id: 'p2' })]), tables: { community_profiles: [ME] } });
  await page.goto('/community/moderate');
  const first = page.getByRole('article', { name: 'Report: Harassment or hate' });
  const hide = rpcCall(page, 'community_mod_set_post_hidden');
  await first.getByRole('button', { name: 'Hide post' }).click();
  expect(bodyOf(await hide)).toEqual({ p_post: 'p1', p_hidden: true });
  await expect(page.getByText('Post hidden')).toBeVisible();

  const dismiss = rpcCall(page, 'community_mod_resolve_report');
  await page.getByRole('article', { name: 'Report: Spam or advertising' }).getByRole('button', { name: 'Dismiss' }).click();
  expect(bodyOf(await dismiss)).toEqual({ p_report: 'r2', p_status: 'dismissed' });
});

test('deleting a post and banning an account both ask first', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: MOD([report()]), tables: { community_profiles: [ME] } });
  await page.goto('/community/moderate');
  const card = page.getByRole('article', { name: 'Report: Harassment or hate' });
  await card.getByRole('button', { name: 'Delete post' }).click();
  await expect(page.getByText('Delete this post for good?')).toBeVisible();
  const del = rpcCall(page, 'community_mod_delete_post');
  await page.getByRole('button', { name: 'Delete post' }).last().click();
  expect(bodyOf(await del)).toEqual({ p_post: 'p1' });

  await card.getByRole('button', { name: 'Ban account' }).click();
  await expect(page.getByText(/Ban @maya.k\?/)).toBeVisible();
  const ban = rpcCall(page, 'community_mod_set_banned');
  await page.getByRole('button', { name: 'Ban account' }).last().click();
  expect(bodyOf(await ban)).toEqual({ p_user: 'u-maya', p_banned: true });
});

test('a banned account can be restored, and the other tabs list past reports', async ({ page, context }, testInfo) => {
  const rows = [report({ reported_banned: true }), report({ id: 'r9', status: 'dismissed', reason: 'spam' })];
  await openApp({ page, context }, testInfo, { rpc: MOD(rows), tables: { community_profiles: [ME] } });
  await page.goto('/community/moderate');
  await expect(page.getByText('@maya.k (banned) reported by @leo.p')).toBeVisible();
  const unban = rpcCall(page, 'community_mod_set_banned');
  await page.getByRole('button', { name: 'Unban' }).click();
  expect(bodyOf(await unban)).toEqual({ p_user: 'u-maya', p_banned: false });
  await page.getByRole('tab', { name: 'Dismissed' }).click();
  await expect(page.getByRole('article', { name: 'Report: Spam or advertising' })).toContainText('Dismissed');
  await page.getByRole('tab', { name: 'Open' }).click();
});

test('with nothing open it says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: MOD([]), tables: { community_profiles: [ME] } });
  await page.goto('/community/moderate');
  await expect(page.getByText('No open reports. Nice.')).toBeVisible();
});
