import { test, expect } from '@playwright/test';
import { openApp, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';
import { ME, card, MEAL } from './communityFixtures.js';

// Photos on posts and profile pictures: pick or take one, it uploads, the check
// runs, and only an approved photo makes the photo-led card.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const ON = { community_access: true };
const bodyOf = (req) => JSON.parse(req.postData() || '{}');
const PHOTO = `${USER_ID}/abc.jpg`;

async function addPhoto(page) {
  await page.getByRole('button', { name: 'Add a photo' }).click();
  await page.getByRole('button', { name: 'Take photo' }).click();
  await expect(page.getByAltText('Your photo')).toBeVisible();
}

test.describe('sharing with a photo', () => {
  test('the photo shows in the preview, uploads first, then the post names it, then it is checked', async ({ page, context }, testInfo) => {
    const log = [];
    const ctx = await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] }, storageLog: log, screen: 'approved' });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await addPhoto(page);
    await expect(page.getByRole('article').getByRole('img', { name: /photo$/ })).toBeVisible(); // photo-led preview
    await assertLayout(page, testInfo, 'x-community-share-photo', ctx);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const body = bodyOf(await write);
    expect(body.photo_path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));
    expect(body.photo_path).toBe(`${USER_ID}/${body.id}.jpg`);
    await expect(page.getByText('Shared to Community')).toBeVisible();
    expect(log.find((l) => l.startsWith('POST community-photos/'))).toBeTruthy();
    expect(log.some((l) => l.startsWith('SCREEN') && l.includes(body.id) && l.includes('"post"'))).toBe(true);
  });

  test('a photo that is not approved still shares the post, and says so', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] }, screen: 'rejected' });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await addPhoto(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(/photo wasn't approved/)).toBeVisible();
  });

  test('if the check cannot run yet, the post goes out and the photo waits', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] }, screen: 'pending' });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await addPhoto(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Shared. Your photo is being checked.')).toBeVisible();
  });

  test('removing the photo before posting means nothing is uploaded', async ({ page, context }, testInfo) => {
    const log = [];
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] }, storageLog: log });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await addPhoto(page);
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(page.getByAltText('Your photo')).toHaveCount(0);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    expect(bodyOf(await write).photo_path).toBeNull();
    expect(log.filter((l) => l.startsWith('POST community-photos/'))).toHaveLength(0);
  });
});

test.describe('photo cards', () => {
  test('an approved photo makes a photo-led card; other people’s unapproved ones stay stats-led', async ({ page, context }, testInfo) => {
    const approved = card('p-photo', { photo_path: 'author/p.jpg', photo_status: 'approved' });
    const hiddenFromMe = card('p-nophoto', { photo_path: null, photo_status: 'pending', payload: { ...MEAL.payload, title: 'Plain bowl' } });
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [approved, hiddenFromMe] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await expect(page.getByRole('img', { name: 'Chicken power bowl photo' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'meal by maya.k' }).first().getByText('Chicken power bowl')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Plain bowl photo' })).toHaveCount(0);
    await assertLayout(page, testInfo, 'x-community-photo-card', ctx);
  });

  test('your own photo shows as checking, or a notice when it was not approved', async ({ page, context }, testInfo) => {
    const mine = (id, status, title) => card(id, { author_id: USER_ID, username: 'alex.m', photo_path: PHOTO, photo_status: status, payload: { ...MEAL.payload, title } });
    // screen: 'pending' = the checker is still unavailable, so the photo keeps waiting.
    await openApp({ page, context }, testInfo, { screen: 'pending', rpc: { ...ON, community_feed_cards: [mine('a', 'pending', 'Waiting bowl'), mine('b', 'rejected', 'Refused bowl')] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await expect(page.getByText('Checking photo…')).toBeVisible();
    await expect(page.getByText(/Your photo wasn't approved/)).toBeVisible();
  });

  test('a photo stuck on "checking" is checked again when you next open the feed', async ({ page, context }, testInfo) => {
    const stuck = card('a', { author_id: USER_ID, username: 'alex.m', photo_path: PHOTO, photo_status: 'pending', payload: { ...MEAL.payload, title: 'Stuck bowl' } });
    await openApp({ page, context }, testInfo, { screen: 'approved', rpc: { ...ON, community_feed_cards: [stuck] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await expect(page.getByRole('article', { name: 'meal by alex.m' }).getByText('Stuck bowl')).toBeVisible();
    await expect(page.getByText('Checking photo…')).toHaveCount(0);
  });

  test('deleting a post with a photo removes the file too', async ({ page, context }, testInfo) => {
    const log = [];
    const mine = card('p-del', { author_id: USER_ID, username: 'alex.m', photo_path: PHOTO, photo_status: 'approved' });
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [mine] }, tables: { community_profiles: [ME] }, storageLog: log });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Delete post' }).click();
    await page.getByRole('button', { name: 'Delete post' }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(log.some((l) => l.startsWith('DELETE community-photos'))).toBe(true);
  });
});

test.describe('profile picture', () => {
  const rpcSelf = { ...ON, community_profile: (req) => [{ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', bio: '', avatar_path: null, is_private: false, is_coach: false, posts: 0, followers: 0, following: 0, relation: 'self', follows_you: false, goal_type: 'lose', streak: 3, discoverable: true, created_at: '2026-10-01T00:00:00Z' }].filter(() => bodyOf(req).p_username === 'alex.m') };

  test('change it: uploads, saves the path, then is checked', async ({ page, context }, testInfo) => {
    const log = [];
    const ctx = await openApp({ page, context }, testInfo, { rpc: rpcSelf, tables: { community_profiles: [ME] }, storageLog: log, screen: 'approved' });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await expect(page.getByText('Others see your initials until a photo is approved.')).toBeVisible();
    await assertLayout(page, testInfo, 'x-community-edit-avatar', ctx);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_profiles') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Add a photo' }).click();
    await page.getByRole('button', { name: 'Take photo' }).click();
    const body = bodyOf(await write);
    expect(body.avatar_path).toMatch(new RegExp(`^${USER_ID}/avatar-\\d+\\.jpg$`));
    await expect(page.getByText('Profile photo updated')).toBeVisible();
    expect(log.some((l) => l.startsWith('SCREEN') && l.includes('"avatar"'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  });

  test('a rejected picture is not kept', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: rpcSelf, tables: { community_profiles: [ME] }, screen: 'rejected' });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('button', { name: 'Add a photo' }).click();
    await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByText(/That photo wasn't approved/).first()).toBeVisible();
  });
});
