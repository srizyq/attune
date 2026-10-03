import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// The calorie card is stretched to the same height as the Weight + Water
// column beside it (top of Weight to bottom of Water), on every chart range,
// and never wider than the screen — 1M/3M used to push it off the right edge.
const cardOf = (label) => (page) => page.evaluate((text) => {
  const el = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === text);
  let card = el;
  while (card && getComputedStyle(card).borderRadius !== '20px') card = card.parentElement;
  const r = card.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}, label);

for (const range of ['1W', '1M', '3M']) {
  test(`dashboard-top-cards-aligned-${range}`, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo);
    await page.goto('/dashboard');
    await settle(page);
    if (range !== '1W') await page.getByRole('button', { name: range, exact: true }).click();
    await page.waitForTimeout(500);

    const [weight, water, today] = await Promise.all([cardOf('WEIGHT')(page), cardOf('WATER')(page), cardOf('TODAY')(page)]);
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(today.top - weight.top), 'tops line up').toBeLessThanOrEqual(1);
    expect(Math.abs(today.bottom - water.bottom), 'bottoms line up').toBeLessThanOrEqual(1);
    expect(today.right, 'calorie card stays on screen').toBeLessThanOrEqual(vw);
    expect(weight.left).toBeGreaterThanOrEqual(0);
    await assertLayout(page, testInfo, `x-dashboard-top-${range}`, ctx);
  });
}

test('dashboard-day-strip', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const days = page.getByTestId('day-tab');
  await expect(days).toHaveCount(7);
  await expect(days.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  // Each day is a small ring + number, not the old 40px filled circle.
  const box = await days.first().boundingBox();
  expect(box.height).toBeLessThan(72);
  await assertLayout(page, testInfo, 'x-dashboard-day-strip', ctx);
});
