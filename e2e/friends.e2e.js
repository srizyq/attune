import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Friends: add people with an invite link, see each other's day as cards, open
// one for their log and shared recipes. No feed, no posts.
const FRIEND_ID = '22222222-2222-4222-8222-222222222222';
const HIDER_ID = '33333333-3333-4333-8333-333333333333';

const friendRow = (over = {}) => ({
  friend_id: FRIEND_ID, name: 'Jordan Lee', hidden: false, items: 3, calories: 1240, protein_g: 96.4, carbs_g: 130, fat_g: 41,
  calorie_target: 2000, protein_target: 150, carbs_target: 220, fat_target: 70, ...over,
});
const friendDay = (over = {}) => ({
  friend_id: FRIEND_ID, name: 'Jordan Lee', hidden: false,
  targets: { calories: 2000, protein_g: 150, carbs_g: 220, fat_g: 70 },
  logs: [
    { id: 'a', meal: 'breakfast', food_name: 'Greek yoghurt', brand: 'Chobani', calories: 190, protein_g: 17, carbs_g: 12, fat_g: 6, serving_grams: 170, logged_amount: 1, logged_unit: 'serving', created_at: '2026-10-16T07:00:00Z' },
    { id: 'b', meal: 'lunch', food_name: 'Chicken burrito bowl', brand: null, calories: 640, protein_g: 48, carbs_g: 70, fat_g: 18, serving_grams: null, logged_amount: null, logged_unit: null, created_at: '2026-10-16T12:00:00Z', ingredients: [{ name: 'Chicken', grams: 120, cal: 200 }] },
    { id: 'c', meal: 'dinner', food_name: 'Salmon', brand: null, calories: 410, protein_g: 31.4, carbs_g: 48, fat_g: 17, serving_grams: 150, logged_amount: 150, logged_unit: 'g', created_at: '2026-10-16T19:00:00Z' },
  ],
  ...over,
});
const RECIPE = { id: 'r1', name: 'Slow-cooker chilli', servings: 4, created_at: '2026-10-10T00:00:00Z', items: [
  { name: 'Beef mince', cal: 800, protein: 80, carbs: 0, fat: 50, servingGrams: 400, loggedAmount: 400, loggedUnit: 'g' },
  { name: 'Kidney beans', cal: 400, protein: 28, carbs: 60, fat: 2, servingGrams: 400, loggedAmount: 400, loggedUnit: 'g' },
] };

test('the Friends tab starts empty with a way to invite someone', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  await page.locator('button[title="Friends"]:visible').click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByText('No friends yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite a friend' }).first()).toBeVisible();
  await expect(page.getByRole('switch', { name: /Share my day with friends/ })).toBeChecked();
  await assertLayout(page, testInfo, 'friends-empty', ctx);
});

test('friends show as cards with today\'s calories and macros, and open into their day', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, {
    rpc: {
      friends_list: [friendRow(), friendRow({ friend_id: HIDER_ID, name: 'Sam Quiet', hidden: true, items: 0, calories: null, protein_g: null, carbs_g: null, fat_g: null })],
      friends_day: friendDay(),
      friends_recipes: [RECIPE],
    },
  });
  await page.goto('/friends');
  await settle(page);
  const card = page.getByRole('button', { name: "Jordan Lee's day" });
  await expect(card).toContainText('1,240');
  await expect(card).toContainText('/ 2,000 kcal');
  await expect(card).toContainText('96.4g');
  await expect(page.getByRole('button', { name: "Sam Quiet's day" })).toContainText('Not sharing today');
  await assertLayout(page, testInfo, 'friends-list', ctx);

  await card.click();
  await expect(page).toHaveURL(new RegExp(`/friends/${FRIEND_ID}$`));
  // Summary on top, then the log, then the recipes they shared.
  const summary = page.getByTestId('day-summary');
  await expect(summary).toContainText('1,240');
  await expect(summary).toContainText('Protein · 150g');
  await expect(page.getByTestId('friend-log-label')).toBeVisible();
  await expect(page.getByText('Greek yoghurt')).toBeVisible();
  await expect(page.getByText('Chicken burrito bowl')).toBeVisible();
  await expect(page.getByText('Recipes Jordan Lee shared')).toBeVisible();
  await expect(page.getByText('Slow-cooker chilli')).toBeVisible();
  // It reads top to bottom: summary, log, recipes.
  const y = async (loc) => (await loc.first().boundingBox()).y;
  expect(await y(summary)).toBeLessThan(await y(page.getByText('Greek yoghurt')));
  expect(await y(page.getByText('Greek yoghurt'))).toBeLessThan(await y(page.getByText('Slow-cooker chilli')));
  // Read-only: no delete or edit controls on their food.
  await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
  await assertLayout(page, testInfo, 'friend-day', ctx);
});

test('a shared recipe expands to its ingredients and can be saved to your own', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { friends_list: [friendRow()], friends_day: friendDay(), friends_recipes: [RECIPE] } });
  await page.goto(`/friends/${FRIEND_ID}`);
  await settle(page);
  await page.getByRole('button', { name: /Slow-cooker chilli/ }).click();
  await expect(page.getByText('Beef mince')).toBeVisible();
  await expect(page.getByText('Makes 4 servings')).toBeVisible();
  await page.getByRole('button', { name: 'Save to my recipes' }).click();
  await expect(page.getByText('Slow-cooker chilli saved to your recipes')).toBeVisible();
});

test('a friend who is not sharing today shows no log, and a friend with no recipes says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { friends_day: friendDay({ hidden: true, logs: [] }), friends_recipes: [] } });
  await page.goto(`/friends/${FRIEND_ID}`);
  await settle(page);
  await expect(page.getByText("Jordan Lee isn't sharing their day today.")).toBeVisible();
  await expect(page.getByTestId('friend-log-label')).toHaveCount(0);
  await expect(page.getByText("Jordan Lee hasn't shared any recipes yet.")).toBeVisible();
});

test('the sharing switches call the database, and Hide today needs sharing on', async ({ page, context }, testInfo) => {
  const calls = [];
  await openApp({ page, context }, testInfo, { rpc: {
    friends_set_sharing: (req) => { calls.push(['sharing', req.postData()]); return null; },
    friends_set_day_hidden: (req) => { calls.push(['hidden', req.postData()]); return null; },
  } });
  await page.goto('/friends');
  await settle(page);
  await page.getByRole('switch', { name: /Hide today/ }).click();
  await expect.poll(() => calls.find((c) => c[0] === 'hidden')?.[1]).toContain('"p_hidden":true');
  await page.getByRole('switch', { name: /Share my day with friends/ }).click();
  await expect.poll(() => calls.find((c) => c[0] === 'sharing')?.[1]).toContain('"p_share":false');
  await expect(page.getByRole('switch', { name: /Hide today/ })).toBeDisabled();
});

test('removing a friend asks first', async ({ page, context }, testInfo) => {
  const removed = [];
  await openApp({ page, context }, testInfo, { rpc: { friends_day: friendDay(), friends_recipes: [], friends_remove: (req) => { removed.push(req.postData()); return null; } } });
  await page.goto(`/friends/${FRIEND_ID}`);
  await settle(page);
  await page.getByRole('button', { name: 'Remove friend' }).click();
  await expect(page.getByText(/You'll stop seeing each other's days/)).toBeVisible();
  expect(removed).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page).toHaveURL(/\/friends$/);
  expect(removed[0]).toContain(FRIEND_ID);
});

test('opening an invite link while signed in shows who it is from and adds them on tap', async ({ page, context }, testInfo) => {
  const added = [];
  await openApp({ page, context }, testInfo, { rpc: {
    friends_preview: [{ friend_id: FRIEND_ID, name: 'Jordan Lee', already: false }],
    friends_add: (req) => { added.push(req.postData()); return FRIEND_ID; },
    friends_day: friendDay(), friends_recipes: [],
  } });
  await page.goto('/friends/join/abcde-12345');
  await expect(page.getByRole('heading', { name: 'Add Jordan Lee as a friend?' })).toBeVisible();
  await page.getByRole('button', { name: 'Add friend' }).click();
  await expect(page).toHaveURL(new RegExp(`/friends/${FRIEND_ID}$`));
  expect(added[0]).toContain('ABCDE12345');
});

test('an invite link that is no longer valid says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { friends_preview: [] } });
  await page.goto('/friends/join/ZZZZZZZZZZ');
  await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible();
});

test('opening an invite link signed out keeps the code and offers sign up or log in', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { signedIn: false });
  await page.goto('/friends/join/ABCDE12345');
  await expect(page.getByRole('heading', { name: 'A friend invited you' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'I already have an account' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('attune_pending_friend'))).toBe('ABCDE12345');
});

test('a code kept from before signing in sends the new member to the invite', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { friends_preview: [{ friend_id: FRIEND_ID, name: 'Jordan Lee', already: false }] } });
  await context.addInitScript(() => { try { localStorage.setItem('attune_pending_friend', 'ABCDE12345'); } catch { /* ignore */ } });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/friends\/join\/ABCDE12345$/);
  await expect(page.getByRole('heading', { name: 'Add Jordan Lee as a friend?' })).toBeVisible();
});

test('the old Community address lands on Friends', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/community');
  await expect(page).toHaveURL(/\/friends$/);
});

test('Coach is still reachable from the Friends tab', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/friends');
  await settle(page);
  await page.getByRole('tab', { name: 'Coach' }).click();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole('tab', { name: 'Friends' })).toBeVisible();
});

test('a recipe can be shared with friends from the Recipes page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/recipes');
  await settle(page);
  await page.getByText('Big breakfast').first().click();
  await page.getByRole('button', { name: 'Share with friends' }).click();
  await expect(page.getByText('Big breakfast is now shared with your friends')).toBeVisible();
});
