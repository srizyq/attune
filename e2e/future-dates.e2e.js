import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Days that haven't happened yet can be opened (to plan meals), on the Daily
// log and the Dashboard.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

test('daily log: the week strip and chevrons reach future days, and food can be added to one', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  await page.goto('/log');
  await settle(page);
  const dateLabel = () => page.getByTestId('log-date').textContent();
  const next = page.getByRole('button', { name: 'Next week' });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByTestId('log-date')).not.toContainText(/^Today/i);
  const label = await dateLabel();
  // That day shows the same page: empty meals with an Add food button.
  await expect(page.getByRole('button', { name: /Add food/ }).first()).toBeVisible();
  await next.click();
  expect(await dateLabel()).not.toBe(label);
  await assertLayout(page, testInfo, 'x-log-future-day', ctx);
});

test('dashboard: a future day in the strip can be opened and says it is a plan', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo);
  const target = ymd(inDays(10));
  await page.goto('/dashboard');
  await settle(page);
  await page.evaluate((date) => {
    window.history.pushState({ usr: { date }, key: 'future', idx: 1 }, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, target);
  await expect(page.getByText(/'s plan$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to today/ })).toBeVisible();
  const tabs = page.getByTestId('day-tab');
  await expect(tabs).toHaveCount(7);
  // Every day in a future week is a live button.
  for (let i = 0; i < 7; i += 1) await expect(tabs.nth(i)).toBeEnabled();
  await assertLayout(page, testInfo, 'x-dashboard-future-day', ctx);
  await page.getByRole('button', { name: /Back to today/ }).click();
  await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible();
});

test('dashboard: tomorrow in this week is tappable', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const tabs = page.getByTestId('day-tab');
  const todayIdx = await tabs.evaluateAll((els) => els.findIndex((el) => el.getAttribute('aria-pressed') === 'true'));
  test.skip(todayIdx === 6, 'today is the last day of the strip');
  await expect(tabs.nth(todayIdx + 1)).toBeEnabled();
  await tabs.nth(todayIdx + 1).click();
  await expect(page.getByText(/'s plan$/)).toBeVisible();
});

test('food search: you can step to a future day to plan a meal', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo);
  await page.goto('/dashboard');
  await settle(page);
  const date = ymd(inDays(3));
  await page.evaluate((d) => {
    window.history.pushState({ usr: { date: d }, key: 'plan', idx: 1 }, '', '/food');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, date);
  const stepper = page.getByRole('button', { name: 'Next day' });
  await expect(stepper).toBeEnabled({ timeout: 20000 }); // the Food search page loads on demand
  await expect(page.getByText('Today', { exact: true })).toHaveCount(0);
  await stepper.click();
  await expect(stepper).toBeEnabled();
});
