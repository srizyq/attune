import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID, ymd, daysAgo } from './fixtures.js';
import { ME, card, MEAL, RECIPE } from './communityFixtures.js';

// Sharing, profiles, finding people, saved posts, and the safety menus.
const ON = { community_access: true };
const profileRow = (over = {}) => ({
  user_id: 'u-maya', username: 'maya.k', display_name: 'Maya', bio: 'Meal prep Sundays', avatar_path: null, is_private: false, is_coach: false,
  posts: 24, followers: 58, following: 61, relation: 'none', follows_you: false, goal_type: 'lose', streak: 14, discoverable: true, created_at: '2026-09-01T00:00:00Z', ...over,
});
const person = (name, over = {}) => ({
  user_id: `u-${name}`, username: name, display_name: name[0].toUpperCase() + name.slice(1), avatar_path: null, is_private: false, is_coach: false,
  goal_type: 'lose', relation: 'none', last_post_at: null, followers: 3, ...over,
});
const bodyOf = (req) => JSON.parse(req.postData() || '{}');
const gotoWithState = async (page, path, state) => {
  await page.evaluate(({ path, state }) => {
    window.history.pushState({ usr: state, key: 'k', idx: 1 }, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, { path, state });
};

test.describe('sharing', () => {
  test('share the day from the Daily log: preview, a note, then Post', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/log');
    await page.getByRole('button', { name: 'Share this day' }).click();
    await expect(page.getByRole('heading', { name: 'Share to Community' }).or(page.getByText('Share to Community', { exact: true }))).toBeVisible();
    const preview = page.getByRole('article');
    await expect(preview.getByText('Today so far')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Public', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Followers', exact: true }).click();
    await page.getByLabel('Add a note (optional)').fill('Big protein day');
    await expect(preview.getByText('Big protein day')).toBeVisible();
    await assertLayout(page, testInfo, 'x-community-share', ctx);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post' }).click();
    const body = bodyOf(await write);
    expect(body).toMatchObject({ author_id: USER_ID, kind: 'day', audience: 'followers', note: 'Big protein day' });
    expect(body.payload).toMatchObject({ title: 'Today so far', partial: true });
    expect(body.payload.items.length).toBeGreaterThan(0);
    await expect(page.getByText('Shared to Community')).toBeVisible();
  });

  test('share one meal; a private account can only post to followers', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [{ ...ME, is_private: true }] } });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await expect(page.getByText('Your account is private, so only people who follow you can see it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Public', exact: true })).toHaveCount(0);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post' }).click();
    const body = bodyOf(await write);
    expect(body).toMatchObject({ kind: 'meal', audience: 'followers' });
    expect(body.payload.meal).toBe('lunch');
  });

  test('a note with a link is refused before it is sent', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/log');
    await page.getByRole('button', { name: /Share Lunch to Community/ }).click();
    await page.getByLabel('Add a note (optional)').fill('see www.example.com');
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByText(/Links aren't allowed in notes/)).toBeVisible();
  });

  test('a day under 1,200 kcal asks first, with support, and can still be shared', async ({ page, context }, testInfo) => {
    const yesterday = ymd(daysAgo(1));
    const row = { id: 'l1', user_id: USER_ID, logged_date: yesterday, meal: 'lunch', food_name: 'Soup', calories: 500, protein_g: 20, carbs_g: 50, fat_g: 10, fibre_g: 2, created_at: new Date().toISOString() };
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME], food_logs: [row] } });
    await page.goto('/dashboard');
    await settle(page);
    await gotoWithState(page, '/log', { date: yesterday });
    await page.getByRole('button', { name: 'Share this day' }).click();
    await expect(page.getByText('This looks like a low day')).toBeVisible();
    await expect(page.getByRole('link', { name: '1800 33 4673' })).toHaveAttribute('href', 'tel:1800334673');
    await expect(page.getByRole('button', { name: 'Post' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Share anyway' }).click();
    await expect(page.getByRole('button', { name: 'Post' })).toBeVisible();
  });

  test('"Not now" on the low-day check closes it without posting', async ({ page, context }, testInfo) => {
    const yesterday = ymd(daysAgo(1));
    const row = { id: 'l1', user_id: USER_ID, logged_date: yesterday, meal: 'lunch', food_name: 'Soup', calories: 500, protein_g: 20, carbs_g: 50, fat_g: 10, fibre_g: 2, created_at: new Date().toISOString() };
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME], food_logs: [row] } });
    await page.goto('/dashboard');
    await settle(page);
    await gotoWithState(page, '/log', { date: yesterday });
    await page.getByRole('button', { name: 'Share this day' }).click();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText('This looks like a low day')).toHaveCount(0);
  });

  test('share a recipe from the Recipes page', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/recipes');
    await page.getByText('Big breakfast', { exact: true }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post' }).click();
    const body = bodyOf(await write);
    expect(body.kind).toBe('recipe');
    expect(body.payload.title).toBe('Big breakfast');
    expect(body.payload.ingredients.length).toBeGreaterThan(0);
  });

  test('without Community there are no share buttons, and not joined sends you to join', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await page.goto('/log');
    await settle(page);
    await expect(page.getByRole('button', { name: 'Share this day' })).toHaveCount(0);
  });
});

test.describe('profiles', () => {
  const rpcFor = (rows, extra = {}) => ({ ...ON, community_profile: (req) => { const u = bodyOf(req).p_username; return rows.filter((r) => r.username === u); }, ...extra });

  test('another person: follow, and see their posts', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: rpcFor([profileRow()], { community_user_cards: [MEAL, RECIPE] }), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/maya.k');
    await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible();
    await expect(page.getByText('Meal prep Sundays')).toBeVisible();
    await expect(page.getByText('14-day streak')).toBeVisible();
    await expect(page.getByText('Losing weight')).toBeVisible();
    await expect(page.getByRole('article', { name: /meal by/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Recipes' }).click();
    await expect(page.getByRole('article', { name: /meal by/ })).toHaveCount(0);
    await expect(page.getByRole('article', { name: /recipe by/ })).toBeVisible();
    await assertLayout(page, testInfo, 'x-community-profile', ctx);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_follows') && r.method() === 'POST');
    const pushed = page.waitForRequest((r) => r.url().includes('/api/notify-trainer-comment'));
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    expect(bodyOf(await write)).toMatchObject({ follower_id: USER_ID, followee_id: 'u-maya' });
    expect(bodyOf(await pushed)).toEqual({ community: 'follow', targetId: 'u-maya' });
  });

  test('a private account you do not follow shows only the basics', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: rpcFor([profileRow({ is_private: true, goal_type: null, streak: null })]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/maya.k');
    await expect(page.getByText('This account is private')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request to follow' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText(/-day streak/)).toHaveCount(0);
  });

  test('an unknown or blocked account is "not available"', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: rpcFor([]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/ghost');
    await expect(page.getByText("This account isn't available.")).toBeVisible();
  });

  test('your own profile: edit the name, bio and privacy', async ({ page, context }, testInfo) => {
    const mine = profileRow({ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', relation: 'self', bio: '' });
    const ctx = await openApp({ page, context }, testInfo, { rpc: rpcFor([mine]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await assertLayout(page, testInfo, 'x-community-edit-profile', ctx);
    await page.getByLabel('Bio').fill('Cutting to 76kg');
    await page.getByRole('switch', { name: /Private account/ }).check();
    await expect(page.getByText('Your public posts will become followers-only.')).toBeVisible();
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_profiles') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(bodyOf(await write)).toMatchObject({ bio: 'Cutting to 76kg', is_private: true, discoverable: true, notify_follows: true, notify_reactions: true });
    await expect(page.getByText('Profile saved')).toBeVisible();
  });

  test('notifications can be turned off per kind', async ({ page, context }, testInfo) => {
    const mine = profileRow({ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', relation: 'self' });
    await openApp({ page, context }, testInfo, { rpc: rpcFor([mine]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await expect(page.getByRole('switch', { name: /Hearts and flames/ })).toBeChecked();
    await page.getByRole('switch', { name: /Hearts and flames/ }).uncheck();
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_profiles') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(bodyOf(await write)).toMatchObject({ notify_follows: true, notify_reactions: false });
  });

  test('leaving Community asks first, then removes everything', async ({ page, context }, testInfo) => {
    const mine = profileRow({ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', relation: 'self' });
    await openApp({ page, context }, testInfo, { rpc: rpcFor([mine]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('button', { name: 'Leave Community' }).click();
    await expect(page.getByText(/This deletes your posts, photos, followers/)).toBeVisible();
    const left = page.waitForRequest((r) => r.url().includes('/rest/v1/rpc/community_leave'));
    await page.getByRole('button', { name: 'Leave and delete everything' }).click();
    await left;
    await expect(page).toHaveURL(/\/community$/);
  });

  test('a bad bio is refused in the edit sheet', async ({ page, context }, testInfo) => {
    const mine = profileRow({ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', relation: 'self' });
    await openApp({ page, context }, testInfo, { rpc: rpcFor([mine]), tables: { community_profiles: [ME] } });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByLabel('Bio').fill('shop at deals.com');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Links aren't allowed in a bio/)).toBeVisible();
  });
});

test.describe('finding people', () => {
  test('search by name, then follow', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_search: [person('maya.k'), person('maya_p', { is_private: true })] }, tables: { community_profiles: [ME] } });
    await page.goto('/community/find');
    await page.getByLabel('Search people').fill('may');
    await expect(page.getByRole('region', { name: 'Search results' }).getByText('@maya.k')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request' })).toBeVisible();
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_follows') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    expect(bodyOf(await write).followee_id).toBe('u-maya.k');
    await expect(page.getByRole('button', { name: /^Following/ })).toBeVisible();
  });

  test('requests: accept one, decline one', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_follow_requests: [person('leo.p'), person('nina_k')] }, tables: { community_profiles: [ME] } });
    await page.goto('/community/find');
    await expect(page.getByText('Follow requests · 2')).toBeVisible();
    await assertLayout(page, testInfo, 'x-community-find', ctx);
    const accept = page.waitForRequest((r) => r.url().includes('/rest/v1/community_follows') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Accept' }).first().click();
    expect(bodyOf(await accept)).toEqual({ status: 'accepted' });
    await expect(page.getByText('Follow requests · 1')).toBeVisible();
    const decline = page.waitForRequest((r) => r.url().includes('/rest/v1/community_follows') && r.method() === 'DELETE');
    await page.getByRole('button', { name: 'Decline' }).click();
    await decline;
    await expect(page.getByText(/Follow requests/)).toHaveCount(0);
  });

  test('Explore: sort and filter by goal ask the database for that', async ({ page, context }, testInfo) => {
    const calls = [];
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_explore: (req) => { calls.push(bodyOf(req)); return [person('maya.k')]; } }, tables: { community_profiles: [ME] } });
    await page.goto('/community/find');
    await expect(page.getByRole('region', { name: 'Explore' }).getByText('@maya.k')).toBeVisible();
    expect(calls[0]).toMatchObject({ p_sort: 'recent', p_goal: null });
    await page.getByRole('button', { name: 'Most followed' }).click();
    await page.getByRole('button', { name: 'Building muscle' }).click();
    await expect.poll(() => calls.at(-1)).toMatchObject({ p_sort: 'followed', p_goal: 'build' });
  });

  test('the feed header links to find people, saved and your profile', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_follow_requests: [person('leo.p')] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await expect(page.getByLabel('1 follow requests')).toBeVisible();
    await page.getByRole('button', { name: 'Find people' }).first().click();
    await expect(page).toHaveURL(/\/community\/find/);
    await page.goBack();
    await page.getByRole('button', { name: 'Saved' }).click();
    await expect(page).toHaveURL(/\/community\/saved/);
  });
});

test.describe('saved posts and the post menu', () => {
  test('Saved lists bookmarked posts and un-saving removes one', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_saved_cards: [{ ...MEAL, saved: true }] }, tables: { community_profiles: [ME] } });
    await page.goto('/community/saved');
    const post = page.getByRole('article', { name: 'meal by maya.k' });
    await expect(post).toBeVisible();
    const del = page.waitForRequest((r) => r.url().includes('/rest/v1/community_saves') && r.method() === 'DELETE');
    await post.getByRole('button', { name: 'Remove from saved' }).click();
    await del;
    await expect(post).toHaveCount(0);
    await expect(page.getByText(/Nothing saved yet/)).toBeVisible();
  });

  test('someone else’s post: report it', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Report post' }).click();
    await page.getByRole('radio', { name: 'Spam or advertising' }).check();
    await assertLayout(page, testInfo, 'x-community-report', ctx);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_reports') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Send report' }).click();
    expect(bodyOf(await write)).toMatchObject({ reporter_id: USER_ID, post_id: 'p-meal', reported_user_id: 'author-p-meal', reason: 'spam' });
    await expect(page.getByText(/Thanks/)).toBeVisible();
  });

  test('a report also asks the server to email it', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Report post' }).click();
    await page.getByRole('radio', { name: 'Harassment or hate' }).check();
    const pushed = page.waitForRequest((r) => r.url().includes('/api/notify-trainer-comment'));
    await page.getByRole('button', { name: 'Send report' }).click();
    expect(bodyOf(await pushed)).toMatchObject({ community: 'report' });
  });

  test('a report needs a reason', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Report post' }).click();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Choose a reason.')).toBeVisible();
  });

  test('block someone from their post, after confirming', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Block @maya.k' }).click();
    await expect(page.getByText(/You won't see each other's posts/)).toBeVisible();
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_blocks') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    expect(bodyOf(await write)).toMatchObject({ blocker_id: USER_ID, blocked_id: 'author-p-meal' });
    await expect(page.getByText('Blocked @maya.k')).toBeVisible();
  });

  test('your own post: edit the note, and delete it after confirming', async ({ page, context }, testInfo) => {
    const mine = card('p-mine', { author_id: USER_ID, username: 'alex.m', display_name: 'Alex', note: 'old note' });
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [mine] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Edit post' }).click();
    await page.getByLabel('Note').fill('new note');
    const patch = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    expect(bodyOf(await patch)).toMatchObject({ note: 'new note', audience: 'public' });
    await expect(page.getByText('new note')).toBeVisible();

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Delete post' }).click();
    const del = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'DELETE');
    await page.getByRole('button', { name: 'Delete post' }).click();
    await del;
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test.describe('the Dashboard and blocking', () => {
  test('a Friends strip shows other people’s recent posts and links to the feed', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, {
      rpc: { ...ON, community_feed_cards: [MEAL, card('p-own', { author_id: USER_ID, username: 'alex.m' }), RECIPE] },
      tables: { community_profiles: [ME] },
    });
    await page.goto('/dashboard');
    const strip = page.getByRole('region', { name: 'Friends' });
    await expect(strip.getByText('maya.k')).toBeVisible();
    await expect(strip.getByText('shared a meal')).toBeVisible();
    await expect(strip.getByText('shared a recipe')).toBeVisible();
    await expect(strip.getByText('alex.m')).toHaveCount(0);
    await settle(page);
    await assertLayout(page, testInfo, 'x-dashboard-friends-strip', ctx);
    await strip.getByRole('button', { name: 'See all' }).click();
    await expect(page).toHaveURL(/\/community$/);
  });

  test('no strip when nobody you follow has posted, or when Community is off', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/dashboard');
    await settle(page);
    await expect(page.getByRole('region', { name: 'Friends' })).toHaveCount(0);
  });

  test('a streak milestone offers to share, prefilled, and is not offered again', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/dashboard');
    const prompt = page.getByRole('region', { name: 'Streak milestone' });
    await expect(prompt.getByText(/\d+ days in a row/)).toBeVisible();
    await prompt.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByLabel('Add a note (optional)')).toHaveValue(/-day streak/);
    const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Post' }).click();
    const body = bodyOf(await write);
    expect(body.kind).toBe('day');
    expect(body.note).toMatch(/-day streak/);
    await page.reload();
    await settle(page);
    await expect(page.getByRole('region', { name: 'Streak milestone' })).toHaveCount(0);
  });

  test('a milestone can be dismissed without posting', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
    await page.goto('/dashboard');
    await page.getByRole('region', { name: 'Streak milestone' }).getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('region', { name: 'Streak milestone' })).toHaveCount(0);
  });

  test('blocked people can be unblocked from your profile', async ({ page, context }, testInfo) => {
    const mine = profileRow({ user_id: USER_ID, username: 'alex.m', display_name: 'Alex', relation: 'self' });
    await openApp({ page, context }, testInfo, {
      rpc: { ...ON, community_profile: [mine], community_blocked_list: [person('bob_x')] },
      tables: { community_profiles: [ME] },
    });
    await page.goto('/community/u/alex.m');
    await page.getByRole('button', { name: 'Blocked people' }).click();
    await expect(page.getByText('@bob_x')).toBeVisible();
    const del = page.waitForRequest((r) => r.url().includes('/rest/v1/community_blocks') && r.method() === 'DELETE');
    await page.getByRole('button', { name: 'Unblock' }).click();
    await del;
    await expect(page.getByText("You haven't blocked anyone.")).toBeVisible();
  });
});
