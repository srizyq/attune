import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// The calorie card is stretched to the same height as the Weight + Water
// column beside it (top of Weight to bottom of Water), on every chart range,
// and never wider than the screen — 1M/3M used to push it off the right edge.
const cardOf = (label) => (page) => page.evaluate((text) => {
  const el = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === text.toLowerCase());
  // Cards are found by the shared --card-radius token, not a hardcoded px value.
  const radius = getComputedStyle(document.querySelector('[data-theme]')).getPropertyValue('--card-radius').trim();
  let card = el;
  while (card && getComputedStyle(card).borderRadius !== radius) card = card.parentElement;
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

// The Steps / Burned cards hold an icon, a label, a value and a chip in half a
// screen of width. The chip once sat right up against (and under) the "BURNED"
// label on a 375px phone. At every common phone width, the chip must keep a
// few pixels clear of every other piece of text in its card and stay inside
// the card.
test('dashboard-activity-cards-no-overlap', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop' || testInfo.project.name === 'tablet', 'phone widths only');
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const measure = () => page.evaluate(() => {
    const out = [];
    const textRect = (e) => { const range = document.createRange(); range.selectNodeContents(e); return range.getBoundingClientRect(); };
    for (const [name, chipText] of [['steps', 'daily'], ['burned', 'active']]) {
      const label = [...document.querySelectorAll('div')].find((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === name);
      if (!label) { out.push(`${name}: label not found`); continue; }
      const card = label.closest('[style*="border-radius"]');
      const parts = [...card.querySelectorAll('div, span')].filter((e) => e.children.length === 0 && e.textContent.trim());
      const chip = parts.find((e) => e.textContent.trim().toLowerCase() === chipText);
      if (!chip) { out.push(`${name}: chip not found`); continue; }
      const c = textRect(chip), box = card.getBoundingClientRect();
      if (c.right > box.right + 0.5 || c.left < box.left - 0.5) out.push(`${name}: chip sticks out of its card`);
      for (const e of parts) {
        if (e === chip) continue;
        const r = textRect(e), gap = 3;
        const near = Math.min(r.right, c.right + gap) - Math.max(r.left, c.left - gap) > 0 && Math.min(r.bottom, c.bottom + gap) - Math.max(r.top, c.top - gap) > 0;
        if (near) out.push(`${name}: "${e.textContent.trim()}" is jammed against the "${chipText}" chip`);
        if (r.right > box.right + 0.5) out.push(`${name}: "${e.textContent.trim()}" sticks out of its card`);
      }
    }
    return out;
  });
  for (const width of [340, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(250);
    expect(await measure(), `activity cards at ${width}px`).toEqual([]);
  }
  await assertLayout(page, testInfo, 'x-dashboard-activity', ctx);
});
