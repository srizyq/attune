import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';
import { ME, DAY, MEAL, RECIPE } from './communityFixtures.js';

// Community: hidden until switched on; then it takes the Coach slot in the
// nav (Coach moves inside it), asks a new member to join, shows a feed of
// photo-less (stats-led) posts, and copies a post into the diary.
const ON = { community_access: true };

test('switched off: the nav keeps Coach and /community goes back to the dashboard', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const nav = testInfo.project.use.isMobile ? page.locator('.app-bottom-nav') : page.locator('.app-sidebar');
  if (testInfo.project.use.isMobile) {
    await expect(nav.getByRole('button', { name: 'Coach' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Community' })).toHaveCount(0);
  }
  await page.goto('/community');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('switched on: Community takes the Coach slot, and Coach shows a Friends | Coach switch', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await settle(page);
  if (testInfo.project.use.isMobile) {
    const nav = page.locator('.app-bottom-nav');
    await expect(nav.getByRole('button', { name: 'Community' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Coach' })).toHaveCount(0);
    await expect(nav.locator('.is-active')).toHaveText(/Community/);
  }
  await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible();
  await page.getByRole('tab', { name: 'Coach' }).click();
  await expect(page).toHaveURL(/\/coach/);
  await expect(page.getByRole('tab', { name: 'Friends' })).toBeVisible({ timeout: 20000 }); // the Coach page loads on demand
  if (testInfo.project.use.isMobile) await expect(page.locator('.app-bottom-nav .is-active')).toHaveText(/Community/);
  await page.getByRole('tab', { name: 'Friends' }).click();
  await expect(page).toHaveURL(/\/community/);
  await settle(page);
  await assertLayout(page, testInfo, 'x-community-empty', ctx);
});

test('a new member joins: asks for the username and public or private, then shows the feed', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: ON });
  await page.goto('/community');
  await page.getByRole('heading', { name: 'Join Community' }).waitFor();
  await assertLayout(page, testInfo, 'x-community-join', ctx);

  await page.getByRole('button', { name: 'Join Community' }).click();
  await expect(page.getByText(/at least 3 characters/)).toBeVisible();
  await expect(page.getByText(/Choose public or private/)).toBeVisible();

  await page.getByLabel('Username').fill('Alex.M');
  await page.getByLabel('Bio (optional)').fill('see www.x');
  await page.getByRole('radio', { name: /Private/ }).check();
  await page.getByRole('button', { name: 'Join Community' }).click();
  await expect(page.getByText(/Links aren't allowed in a bio/)).toBeVisible();

  await page.getByLabel('Bio (optional)').fill('Meal prep Sundays');
  const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_profiles') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Join Community' }).click();
  const body = JSON.parse((await write).postData());
  expect(body).toMatchObject({ username: 'alex.m', display_name: 'Alex Morgan', is_private: true, bio: 'Meal prep Sundays' });
  await expect(page.getByText('Your feed is empty')).toBeVisible();
});

test('someone under 16 is told, and someone with no age on file is sent to their profile', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: ON, profile: { age: 15, date_of_birth: null } });
  await page.goto('/community');
  await expect(page.getByText('Community is for people aged 16 and over.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join Community' })).toHaveCount(0);
});

test('the feed shows day, meal and recipe posts; hearts and saves toggle', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [DAY, MEAL, RECIPE] }, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await page.getByRole('article', { name: 'day by maya.k' }).waitFor();
  const day = page.getByRole('article', { name: 'day by maya.k' });
  await expect(day.getByRole('img', { name: '98% of daily goal' })).toBeVisible();
  await expect(day.getByText('Today so far')).toBeVisible();
  await expect(day.getByText('P 150g')).toBeVisible();
  const meal = page.getByRole('article', { name: 'meal by maya.k' });
  await expect(meal.getByText('Chicken power bowl')).toBeVisible();
  await expect(meal.getByText('So good')).toBeVisible();
  const recipe = page.getByRole('article', { name: 'recipe by sam.r' });
  await expect(recipe.getByText('Copy recipe · 21')).toBeVisible();
  await expect(recipe.getByText('2 ingredients · makes 2')).toBeVisible();

  const heart = meal.getByRole('button', { name: /^Heart/ });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  const write = page.waitForRequest((r) => r.url().includes('/rest/v1/community_reactions') && r.method() === 'POST');
  await heart.click();
  expect(JSON.parse((await write).postData())).toMatchObject({ post_id: 'p-meal', user_id: USER_ID, kind: 'heart' });
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await expect(heart).toHaveText('4');
  await meal.getByRole('button', { name: 'Save' }).click();
  await expect(meal.getByRole('button', { name: 'Remove from saved' })).toBeVisible();
  await assertLayout(page, testInfo, 'x-community-feed', ctx);
});

test('copying a meal puts it in the chosen meal of the diary; a day keeps its meals', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [DAY, MEAL] }, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await page.getByRole('article', { name: 'meal by maya.k' }).getByRole('button', { name: /Copy to my log/ }).click();
  await page.getByRole('button', { name: 'Dinner' }).click();
  await assertLayout(page, testInfo, 'x-community-copy', ctx);
  const write = page.waitForRequest((r) => r.url().includes('/rest/v1/food_logs') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Add to Dinner' }).click();
  const rows = JSON.parse((await write).postData());
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ user_id: USER_ID, meal: 'dinner', food_name: 'Grilled chicken', calories: 400, source: 'community' });
  await expect(page.getByText(/2 items added to your log/)).toBeVisible();

  await page.getByRole('article', { name: 'day by maya.k' }).getByRole('button', { name: /Copy day/ }).click();
  const dayWrite = page.waitForRequest((r) => r.url().includes('/rest/v1/food_logs') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Add day to my log' }).click();
  const dayRows = JSON.parse((await dayWrite).postData());
  expect(dayRows.map((r) => r.meal)).toEqual(['breakfast', 'lunch']);
});

test('copying a recipe saves it to your recipes', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [RECIPE] }, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await page.getByRole('button', { name: /Copy recipe/ }).click();
  const write = page.waitForRequest((r) => r.url().includes('/rest/v1/saved_meals') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const body = JSON.parse((await write).postData());
  expect(body).toMatchObject({ user_id: USER_ID, name: 'Overnight oats', servings: 2 });
  expect(body.items[0]).toMatchObject({ name: 'Oats', cal: 300, servingGrams: 80 });
  await expect(page.getByText('Overnight oats saved to your recipes')).toBeVisible();
});

test('your own posts have no copy button', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [{ ...MEAL, author_id: USER_ID, username: 'alex.m' }] }, tables: { community_profiles: [ME] } });
  await page.goto('/community');
  await page.getByRole('article', { name: 'meal by alex.m' }).waitFor();
  await expect(page.getByRole('button', { name: /Copy to my log/ })).toHaveCount(0);
  await expect(page.getByText('Copied 2×')).toBeVisible();
});

test.describe('sharing from inside Community', () => {
  const post = (page) => page.waitForRequest((r) => r.url().includes('/rest/v1/community_posts') && r.method() === 'POST');

  test('the + offers today, a meal or a recipe — and Post shares it', async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'Share to Community' }).click();
    await expect(page.getByRole('button', { name: 'Today so far' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'A meal from today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'A recipe' })).toBeVisible();
    // The menu is as tall as its buttons, not a full-screen sheet with a gap below them.
    const menu = await page.getByRole('dialog', { name: 'What do you want to share?' }).boundingBox();
    expect(menu.height).toBeLessThan(page.viewportSize().height * 0.6);
    await assertLayout(page, testInfo, 'x-community-share-chooser', ctx);

    await page.getByRole('button', { name: 'Today so far' }).click();
    const write = post(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const body = JSON.parse((await write).postData());
    expect(body).toMatchObject({ kind: 'day', author_id: USER_ID });
    await expect(page.getByText('Shared to Community')).toBeVisible();
  });

  test('pick a meal from today', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'Share to Community' }).click();
    await page.getByRole('button', { name: 'A meal from today' }).click();
    await page.getByRole('button', { name: /^Lunch · / }).click();
    const write = post(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    expect(JSON.parse((await write).postData())).toMatchObject({ kind: 'meal' });
  });

  test('pick a recipe', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { ...ON, community_feed_cards: [MEAL] }, tables: { community_profiles: [ME] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'Share to Community' }).click();
    await page.getByRole('button', { name: 'A recipe' }).click();
    await page.getByRole('button', { name: 'Big breakfast' }).click();
    const write = post(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    expect(JSON.parse((await write).postData())).toMatchObject({ kind: 'recipe' });
  });

  test('an empty feed has a Share something button too; with nothing logged it says what to do', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: ON, tables: { community_profiles: [ME], food_logs: [], saved_meals: [] } });
    await page.goto('/community');
    await page.getByRole('button', { name: 'Share something' }).click();
    await expect(page.getByText(/Nothing to share yet/)).toBeVisible();
  });
});
