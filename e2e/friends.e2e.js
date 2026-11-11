import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';

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
  await expect(page.getByRole('button', { name: 'Full meals' })).toHaveAttribute('aria-pressed', 'true');
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

test('Coach is still reachable from the Friends page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/friends');
  await settle(page);
  await page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('button', { name: 'Coach' }).click();
  await expect(page).toHaveURL(/\/coach$/);
});

test('a recipe can be shared with friends from the Recipes page', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/recipes');
  await settle(page);
  await page.getByText('Big breakfast').first().click();
  await page.getByRole('button', { name: 'Share with friends' }).click();
  await expect(page.getByText('Big breakfast is now shared with your friends')).toBeVisible();
});

// ── sharing levels, friend circles, the Recipes page ──────────────────────────
const SAM_ID = '44444444-4444-4444-8444-444444444444';
const calls = (rpcCalls, name) => rpcCalls.filter((c) => c[0] === name).map((c) => c[1]);

test('Full meals / Totals only / Private call the database, with a hint for each', async ({ page, context }, testInfo) => {
  const seen = [];
  await openApp({ page, context }, testInfo, { rpc: {
    friends_list: [friendRow()],
    friends_set_share_level: (req) => { seen.push(['level', req.postData()]); return null; },
    friends_set_day_hidden: (req) => { seen.push(['hidden', req.postData()]); return null; },
  } });
  await page.goto('/friends');
  await settle(page);
  const hint = page.getByTestId('share-hint');
  await expect(hint).toContainText('what you ate');
  await page.getByRole('button', { name: 'Totals only' }).click();
  await expect.poll(() => calls(seen, 'level')[0]).toContain('"p_level":"totals"');
  await expect(page.getByRole('button', { name: 'Totals only' })).toHaveAttribute('aria-pressed', 'true');
  await expect(hint).toContainText('never what you ate');
  await page.getByRole('switch', { name: /Hide today/ }).click();
  await expect.poll(() => calls(seen, 'hidden')[0]).toContain('"p_hidden":true');
  await page.getByRole('button', { name: 'Private' }).click();
  await expect.poll(() => calls(seen, 'level')[1]).toContain('"p_level":"private"');
  await expect(hint).toContainText('nothing of your day');
  await expect(page.getByRole('switch', { name: /Hide today/ })).toBeDisabled();
});

test('before the database update there is no Totals only, and Private uses the old on/off call', async ({ page, context }, testInfo) => {
  const seen = [];
  await openApp({ page, context }, testInfo, { rpc: {
    friends_me: [{ invite_code: 'ABCDE12345', share_day: true }],
    friends_set_sharing: (req) => { seen.push(['sharing', req.postData()]); return null; },
  } });
  await page.goto('/friends');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Totals only' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Private' }).click();
  await expect.poll(() => calls(seen, 'sharing')[0]).toContain('"p_share":false');
});

test('a failed change puts the control back and says so', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/friends');
  await settle(page);
  await page.route('**/rpc/friends_set_share_level', (route) => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'boom' }) }));
  await page.getByRole('button', { name: 'Totals only' }).click();
  await expect(page.getByText('Something went wrong. Try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full meals' })).toHaveAttribute('aria-pressed', 'true');
});

const THREE = {
  friends_list: [
    friendRow({ level: 'full' }),
    friendRow({ friend_id: SAM_ID, name: 'Sam Totals', level: 'totals', items: 4, calories: 900 }),
    friendRow({ friend_id: HIDER_ID, name: 'Sam Quiet', hidden: true, level: 'none', items: 0, calories: null, protein_g: null, carbs_g: null, fat_g: null }),
  ],
};

for (const theme of ['dark', 'light']) {
  test(`friend circles with calorie rings, and day cards that say what is shared · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: THREE, profile: { theme } });
    await page.goto('/friends');
    await settle(page);
    await expect(page.getByTestId('friend-circles').getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Jordan Lee, 62% of calories' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sam Quiet, not sharing today' })).toBeVisible();
    await expect(page.getByRole('button', { name: "Sam Totals's day" })).toContainText('Totals only');
    await expect(page.getByRole('button', { name: "Jordan Lee's day" })).not.toContainText('Totals only');
    await expect(page.getByRole('button', { name: "Jordan Lee's day" })).toContainText('3 items logged');
    await assertLayout(page, testInfo, `x-friends-list-${theme}`, ctx);
  });
}

test('a circle opens that friend', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_day: friendDay(), friends_recipes: [] } });
  await page.goto('/friends');
  await settle(page);
  await page.getByRole('button', { name: /^Jordan Lee, / }).click();
  await expect(page).toHaveURL(new RegExp(`/friends/${FRIEND_ID}$`));
});

test('a totals-only friend shows the numbers and never a food', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, { rpc: {
    friends_day: friendDay({ level: 'totals', logs: [], totals: { items: 3, calories: 1240, protein_g: 96.4, carbs_g: 130, fat_g: 41 } }),
    friends_recipes: [],
  } });
  await page.goto(`/friends/${FRIEND_ID}`);
  await settle(page);
  await expect(page.getByTestId('day-summary')).toContainText('1,240');
  await expect(page.getByTestId('day-summary')).toContainText('96.4g');
  await expect(page.getByTestId('friend-totals-only')).toContainText('totals only');
  await expect(page.getByTestId('friend-log-label')).toHaveCount(0);
  await expect(page.getByText('Greek yoghurt')).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-friend-day-totals', ctx);
});

const RECIPE_PHOTO = { id: 'r2', name: 'Chia pudding', servings: 1, created_at: '2026-10-12T00:00:00Z', photo_path: `${FRIEND_ID}/p.jpg`, prep_minutes: 10, tags: ['Dessert', 'Pre-workout'], items: [
  { name: 'Chia seeds', cal: 120, protein: 4, carbs: 10, fat: 8, servingGrams: 25, loggedAmount: 25, loggedUnit: 'g' },
] };
const SAM_RECIPE = { id: 'r3', name: 'Overnight oats', servings: 2, created_at: '2026-10-14T00:00:00Z', photo_path: null, prep_minutes: null, tags: [], items: [
  { name: 'Oats', cal: 300, protein: 10, carbs: 50, fat: 6, servingGrams: 80, loggedAmount: 80, loggedUnit: 'g' },
] };
const byFriend = (map) => (req) => map[JSON.parse(req.postData() || '{}').p_friend] || [];

for (const theme of ['dark', 'light']) {
  test(`the Recipes page lists what friends shared, with photos and who from · ${theme}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_recipes: byFriend({ [FRIEND_ID]: [RECIPE, RECIPE_PHOTO], [SAM_ID]: [SAM_RECIPE] }) }, profile: { theme } });
    await page.goto('/friends');
    await settle(page);
    await page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('button', { name: 'Recipes' }).click();
    await expect(page).toHaveURL(/\/friends\/recipes$/);
    await expect(page.getByTestId('friend-recipe')).toHaveCount(3);
    await expect(page.getByTestId('friend-recipe').first()).toContainText('Overnight oats'); // newest first
    await expect(page.getByTestId('friend-recipe').filter({ hasText: 'Chia pudding' })).toContainText('From Jordan Lee');
    await expect(page.getByTestId('friend-recipe').filter({ hasText: 'Chia pudding' }).locator('img')).toHaveCount(1);
    await expect(page.getByTestId('friend-recipe').filter({ hasText: 'Chia pudding' })).toContainText('Dessert');
    await expect(page.getByTestId('friend-recipe').filter({ hasText: 'Overnight oats' }).locator('img')).toHaveCount(0);
    await assertLayout(page, testInfo, `x-friends-recipes-${theme}`, ctx);
  });
}

test('the Recipes page can be narrowed to one friend', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_recipes: byFriend({ [FRIEND_ID]: [RECIPE], [SAM_ID]: [SAM_RECIPE] }) } });
  await page.goto('/friends/recipes');
  await settle(page);
  await expect(page.getByTestId('friend-recipe')).toHaveCount(2);
  await page.getByRole('group', { name: 'Show recipes from' }).getByRole('button', { name: 'Sam' }).first().click();
  await expect(page.getByTestId('friend-recipe')).toHaveCount(1);
  await expect(page.getByTestId('friend-recipe')).toContainText('Overnight oats');
});

test('saving a friend\'s recipe copies it, with its tags and prep time', async ({ page, context }, testInfo) => {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/rest/v1/saved_meals')) posts.push(JSON.parse(r.postData() || '{}')); });
  await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_recipes: byFriend({ [FRIEND_ID]: [RECIPE_PHOTO] }) } });
  await page.goto('/friends/recipes');
  await settle(page);
  await page.getByRole('button', { name: 'Save to my recipes' }).click();
  await expect(page.getByText('Chia pudding saved to your recipes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saved to your recipes' })).toBeDisabled();
  expect(posts[0]).toMatchObject({ name: 'Chia pudding', servings: 1, tags: ['Dessert', 'Pre-workout'], prep_minutes: 10 });
  expect(posts[0].photo_path).toBeUndefined(); // the photo stays the friend's
});

test('the Recipes page says so when nobody has shared one', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_recipes: [] } });
  await page.goto('/friends/recipes');
  await settle(page);
  await expect(page.getByText('No shared recipes yet')).toBeVisible();
  await expect(page.getByText(/When a friend shares one/)).toBeVisible();
});

test('Friends has no tabs: recipes is a page with a way back, and the old tab link still lands there', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: THREE });
  await page.goto('/friends');
  await settle(page);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('button', { name: 'Recipes' }).click();
  await page.getByRole('button', { name: 'Back to Friends' }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByTestId('friend-circles')).toBeVisible();
  await page.goto('/friends?tab=recipes');
  await expect(page).toHaveURL(/\/friends\/recipes$/);
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`friends pages fit every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(240000);
    const ctx = await openApp({ page, context }, testInfo, { rpc: { ...THREE, friends_day: friendDay(), friends_recipes: byFriend({ [FRIEND_ID]: [RECIPE, RECIPE_PHOTO], [SAM_ID]: [SAM_RECIPE] }) }, profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      for (const [label, path] of [['friends', '/friends'], ['recipes', '/friends/recipes'], ['friend day', `/friends/${FRIEND_ID}`]]) {
        await page.goto(path); await settle(page);
        for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} ${label}: ${p.check} — ${p.msg}`);
      }
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
