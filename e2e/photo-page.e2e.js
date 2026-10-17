import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';

// The photo scan result is a full page: AI banner, the photo with item chips,
// total plate energy with macros, a "target synergy" card, and one card per
// detected item with its own portion stepper — plus a pinned Log bar.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const PLATE = {
  name: 'Salmon, quinoa and asparagus', portion: '1 plate (~475g)', confidence: 'high', insight: 'High in protein and omega-3 fats, with very little refined sugar.',
  ingredients: [
    { name: 'Grilled Atlantic Salmon', grams: 170, match: 99, portion: '6 oz fillet', cal: 280, protein: 34, carbs: 0, fat: 15, fibre: 0 },
    { name: 'Quinoa and roasted tomatoes', grams: 185, match: 94, portion: '1 cup cooked', cal: 222, protein: 9, carbs: 29, fat: 6.5, fibre: 4 },
    { name: 'Steamed asparagus spears', grams: 120, match: 96, portion: '8-10 spears', cal: 27, protein: 3, carbs: 5, fat: 0.5, fibre: 2.2 },
  ],
};

const foodLogPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};

async function openPhoto(page, body = PLATE, { waitForResult = true } = {}) {
  await page.route('**/api/recognize-food', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openPhotoScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: 'Take photo' }).click();
  if (waitForResult) await page.getByTestId('photo-result').waitFor();
}

test('photo result page: banner, items with match and portion, energy card, insight', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await openPhoto(page);
  const r = page.getByTestId('photo-result');
  await expect(r.getByText('Attune AI')).toBeVisible();
  await expect(r.getByText('3 items detected in your photo')).toBeVisible();
  await expect(r.getByText('96% match').first()).toBeVisible(); // average of 99, 94, 96
  await expect(r.getByText('99% match')).toBeVisible();
  await expect(r.getByText('6 oz fillet')).toBeVisible();
  await expect(r.getByText('Total plate energy')).toBeVisible();
  await expect(r.getByText('Target synergy')).toBeVisible();
  await expect(r.getByText(/omega-3 fats/)).toBeVisible();
  await assertLayout(page, testInfo, 'x-photo-result', ctx);
});

test('changing an item\'s portion updates the total and the Log button', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await openPhoto(page);
  const r = page.getByTestId('photo-result');
  const log = r.getByRole('button', { name: /^Log plate \(\d+ kcal\) to / });
  await expect(log).toContainText('529 kcal');
  await r.getByRole('button', { name: 'Decrease Grilled Atlantic Salmon' }).click();
  await expect(r.getByLabel('Grilled Atlantic Salmon weight in grams')).toHaveValue('160');
  await expect(log).not.toContainText('529 kcal');
});

test('a missed item can be added, and any item can be removed', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await openPhoto(page);
  const r = page.getByTestId('photo-result');
  await r.getByRole('button', { name: /Add item/ }).click();
  await r.getByLabel('New item name').fill('Olive oil');
  await r.getByLabel('New item weight in grams').fill('10');
  await r.getByLabel('New item calories').fill('90');
  await r.getByLabel('New item fat').fill('10');
  await r.getByRole('button', { name: 'Add to plate' }).click();
  await expect(r.getByText('4 items detected in your photo')).toBeVisible();
  await expect(r.getByRole('button', { name: /^Log plate \(619 kcal\)/ })).toBeVisible();

  await r.getByRole('button', { name: 'Remove Steamed asparagus spears' }).click();
  await expect(r.getByText('3 items detected in your photo')).toBeVisible();
  await r.getByRole('button', { name: 'Dinner', exact: true }).click();
  await r.getByRole('button', { name: /^Log plate \(592 kcal\) to Dinner/ }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ source: 'photo', calories: 592 });
  expect(posts[0].ingredients.map(i => i.name)).toEqual(['Grilled Atlantic Salmon', 'Quinoa and roasted tomatoes', 'Olive oil']);
});

test('a scan without the new AI fields still shows a clean page', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await openPhoto(page, { name: 'Toast', portion: '1 slice', confidence: 'medium', ingredients: [{ name: 'Toast', grams: 30, cal: 80, protein: 3, carbs: 14, fat: 1 }] });
  const r = page.getByTestId('photo-result');
  await expect(r.getByText('Medium confidence')).toBeVisible();
  await expect(r.getByText(/% match/)).toHaveCount(0);
  await expect(r.getByRole('button', { name: /Remove Toast/ })).toHaveCount(0); // the last item can't be removed
  await assertLayout(page, testInfo, 'x-photo-result-bare', ctx);
});

test('a failed scan shows the error page with a way forward', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await openPhoto(page, { error: 'No food detected in this photo.' }, { waitForResult: false });
  await expect(page.getByText('No food detected in this photo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try another photo' })).toBeVisible();
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`photo result fits every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(120000);
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await openPhoto(page);
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height}: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
