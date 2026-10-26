import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { openApp, settle } from './harness.js';
import { USER_ID, ymd, daysAgo } from './fixtures.js';

// How long a client's page is on a phone. It used to be 3.5 screens for the
// overview and 6 for the diary (most of it nutrient cards); this holds the line
// so a new card can't quietly make it long again. The client is the fake signed-in
// user so the diary, weight and workout fixtures all load for them.
const today = ymd(new Date());
const link = { id: 'link-1', trainer_id: USER_ID, client_id: USER_ID, status: 'active', created_at: '2026-09-01T00:00:00Z', group_label: 'Online',
  client: { id: USER_ID, name: 'Maya Patel', goal: 'lose', calorie_target: 2100, protein_g: 150, carbs_g: 220, fat_g: 70, unit: 'metric', pace_kg_per_week: 0.5, targets_set_by: USER_ID, targets_set_at: '2026-10-12T02:00:00Z' } };
const summary = { link_id: 'link-1', client_id: USER_ID, client_name: 'Maya Patel', group_label: 'Online', connected_at: '2026-09-01T00:00:00Z', goal: 'lose', calorie_target: 2100, protein_g: 150,
  last_log_date: ymd(daysAgo(2)), days_logged_7d: 4, days_on_target_7d: 1, days_protein_7d: 1, avg_cal_7d: 1500, today_cal: 0, latest_weight_kg: 71.2, latest_weight_date: today, weight_change_kg_14d: 0.7,
  last_checkin_date: today, days_complete_7d: 2, days_judged_7d: 4, avg_cal_complete_7d: 1900, pace_kg_per_week: 0.5, weight_rate_kg_week: -0.04, weigh_ins_28d: 9, targets_set_by: USER_ID, targets_overridden_at: null };

const heightOf = (page) => page.evaluate(() => document.querySelector('.app-content-pad').scrollHeight);

test('a client\'s Snapshot and Diary stay short on a phone', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the budget is for a phone');
  const ctx = await openApp({ page, context }, testInfo, {
    profile: { coach_pass: true, coach_mode: true, coach_pass_status: 'active' },
    tables: { trainer_clients: [link] },
    rpc: { get_client_summaries: [summary] },
  });
  await page.goto('/coach');
  await settle(page);
  await page.locator('div[role="button"]', { hasText: 'Maya Patel' }).click();
  await settle(page);
  const screens = (h) => h / 844;
  const snapshot = await heightOf(page);
  // Pictures of the whole page, for eyeballing (e2e/screens is git-ignored).
  mkdirSync('e2e/screens/phone', { recursive: true });
  await page.setViewportSize({ width: 390, height: Math.min(snapshot + 140, 4000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screens/phone/coach-client-snapshot-full.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Diary' }).click();
  await settle(page);
  const diary = await heightOf(page);
  await page.setViewportSize({ width: 390, height: Math.min(diary + 140, 4000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screens/phone/coach-client-diary-full.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Show all/ }).click();
  const diaryExpanded = await heightOf(page);
  console.log(`SCREENS snapshot ${screens(snapshot).toFixed(1)} · diary ${screens(diary).toFixed(1)} · diary with every nutrient ${screens(diaryExpanded).toFixed(1)}`);
  testInfo.annotations.push({ type: 'screens', description: `snapshot ${screens(snapshot).toFixed(1)}, diary ${screens(diary).toFixed(1)}, diary with every nutrient ${screens(diaryExpanded).toFixed(1)}` });
  // Before: Overview 3.5 screens, Diary 6.0. Now about 1.9 and 1.7.
  expect(screens(snapshot), `Snapshot is ${screens(snapshot).toFixed(1)} screens`).toBeLessThanOrEqual(2.2);
  expect(screens(diary), `Diary is ${screens(diary).toFixed(1)} screens`).toBeLessThanOrEqual(2.0);
  expect(diaryExpanded, 'showing every nutrient is the long version, on request').toBeGreaterThan(diary);
  expect(ctx.consoleErrors).toEqual([]);
});
