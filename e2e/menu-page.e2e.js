import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';

// The menu scan result is a ranked, filterable page: AI banner, filter chips,
// dining advice, ranked pick cards (match %, price, tip, macros, Log to <meal>,
// Customize), the full menu by section, and a pinned "Log N items" bar.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

const MENU = {
  restaurant: 'Lumière Bistro',
  advice: 'Order the scallops: they keep protein high and stay inside tonight\'s budget.',
  recommendations: [
    { name: 'Pan-Seared Scallops', items: 'Atlantic sea scallops, parsnip purée, charred broccolini', modifications: null, price: '$34', match: 98, tip: 'Ask for dressing on the side to save ~80 kcal.', cal: 410, protein: 44, carbs: 18, fat: 16, confidence: 'high' },
    { name: 'Duck Confit Leg', items: 'Slow-cooked duck, braised lentils', modifications: null, price: '$38', match: 86, cal: 620, protein: 48, carbs: 12, fat: 42, confidence: 'medium' },
  ],
  items: [
    { section: 'Mains', name: 'Ribeye Steak Frites', description: 'With fries', price: '$42', cal: 780, protein: 52, carbs: 60, fat: 38 },
    { section: 'Mains', name: 'Wild Mushroom Risotto', description: '', price: '$26', cal: 540, protein: 14, carbs: 78, fat: 18 },
    { section: 'Sides', name: 'Green Salad', description: '', cal: 120, protein: 3, carbs: 10, fat: 7 },
  ],
};

const foodLogPosts = (page) => {
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/food_logs') && r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}')); });
  return posts;
};

async function openMenu(page, body = MENU) {
  await page.route('**/api/recognize-menu', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JSON.parse(route.request().postData() || '{}').detail ? {} : body) }));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate(() => {
    window.history.pushState({ usr: { openMenuScan: true }, key: 'scan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.getByTestId('menu-result').waitFor();
}

test('menu result page: restaurant, advice, ranked cards with match, price and tip', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await openMenu(page);
  const r = page.getByTestId('menu-result');
  await expect(r.getByText('Lumière Bistro').first()).toBeVisible();
  await expect(r.getByText('Smart dining advice')).toBeVisible();
  await expect(r.getByText(/Order the scallops/)).toBeVisible();
  await expect(r.getByText('Top goal fit · 98% match')).toBeVisible();
  await expect(r.getByText('$34')).toBeVisible();
  await expect(r.getByText(/Ask for dressing on the side/)).toBeVisible();
  await expect(r.getByText('Curated & ranked')).toBeVisible();
  await expect(r.getByText('Full menu')).toBeVisible();
  await assertLayout(page, testInfo, 'x-menu-result', ctx);
});

test('filter chips narrow the list', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await openMenu(page);
  const r = page.getByTestId('menu-result');
  await r.getByRole('button', { name: /^High protein/ }).click();
  await expect(r.getByText('Ribeye Steak Frites')).toBeVisible();
  await expect(r.getByText('Wild Mushroom Risotto')).toHaveCount(0);
  await expect(r.getByText('Curated & ranked')).toHaveCount(0);
  await r.getByRole('button', { name: /^Low carb/ }).click();
  await expect(r.getByText('Green Salad')).toBeVisible();
  await expect(r.getByText('Ribeye Steak Frites')).toHaveCount(0);
  await r.getByRole('button', { name: /^Top goal matches/ }).click();
  await expect(r.getByText('Duck Confit Leg').first()).toBeVisible();
  await expect(r.getByText('Full menu')).toHaveCount(0);
});

test('"Log to <meal>" on a ranked dish logs it straight away', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await openMenu(page);
  await page.getByRole('button', { name: /^Log Pan-Seared Scallops to / }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ food_name: 'Pan-Seared Scallops', calories: 410, source: 'menu' });
});

test('ticking dishes shows the selection bar and logs them all', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  const posts = foodLogPosts(page);
  await openMenu(page);
  await page.getByRole('checkbox', { name: 'Select Pan-Seared Scallops' }).click();
  await expect(page.getByText(/Selected: Pan-Seared Scallops \(410 kcal\)/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select Green Salad' }).click();
  await expect(page.getByText(/Selected: 2 dishes \(530 kcal\)/)).toBeVisible();
  await page.getByRole('button', { name: /^Log 2 items to .*\(530 kcal\)/ }).click();
  await expect.poll(() => posts.length).toBe(2);
});

test('a menu without the new AI fields still renders (no advice from the AI, no prices, no match)', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await openMenu(page, { recommendations: [{ name: 'Grilled chicken salad', items: 'Chicken, leaves', modifications: 'None', cal: 420, protein: 38, carbs: 14, fat: 22, confidence: 'high' }], items: [{ section: 'Mains', name: 'Burger', description: '', cal: 900, protein: 40, carbs: 70, fat: 50 }] });
  const r = page.getByTestId('menu-result');
  await expect(r.getByText('Top goal fit')).toBeVisible();
  await expect(r.getByText(/% match/)).toHaveCount(0);
  await expect(r.getByText('Modified:')).toHaveCount(0);
  await expect(r.getByText(/Based on your remaining/)).toBeVisible(); // our own sentence from your targets
  await assertLayout(page, testInfo, 'x-menu-result-bare', ctx);
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`menu result fits every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(120000);
    const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await openMenu(page);
      await page.getByRole('checkbox', { name: 'Select Pan-Seared Scallops' }).click();
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height}: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
