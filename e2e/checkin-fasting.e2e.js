import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';
import { USER_ID } from './fixtures.js';

// Behaviour (not just layout) for the Dashboard check-in tiles and the Fasting
// page. Writes go to the fake backend, so we assert on what the app *sent*.

function recordWrites(page, table) {
  const writes = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.method() !== 'OPTIONS' && new URL(req.url()).pathname.endsWith(`/rest/v1/${table}`)) {
      try { writes.push({ method: req.method(), body: JSON.parse(req.postData() || '{}') }); } catch { /* ignore */ }
    }
  });
  return writes;
}

test.describe('check-in tiles', () => {
  test('mood saves only the mood — nothing else on the day\'s row', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const writes = recordWrites(page, 'checkins');
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: /^Mood/ }).click();
    await page.getByRole('button', { name: 'Great', exact: true }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    const body = Array.isArray(writes[0].body) ? writes[0].body[0] : writes[0].body;
    expect(body).toMatchObject({ user_id: USER_ID, mood: 'great' });
    expect(Object.keys(body).sort()).toEqual(['checkin_date', 'mood', 'user_id']);
  });

  test('energy is stored on the 1–10 scale', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const writes = recordWrites(page, 'checkins');
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: /^Energy/ }).click();
    await page.getByRole('button', { name: 'Good, 4 of 5' }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    const body = Array.isArray(writes[0].body) ? writes[0].body[0] : writes[0].body;
    expect(body.energy).toBe(8);
  });

  test('sleep: hours are saved once, after the taps settle, then quality on its own', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const writes = recordWrites(page, 'checkins');
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: /^Sleep/ }).click();
    await page.getByRole('button', { name: 'Half an hour more' }).click(); // 7 → 7.5 (nothing was set)
    await page.getByRole('button', { name: 'Half an hour more' }).click(); // 8
    await page.getByRole('button', { name: 'Half an hour more' }).click(); // 8.5
    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1);
    const first = Array.isArray(writes[0].body) ? writes[0].body[0] : writes[0].body;
    expect(first.sleep_hours).toBe(8.5);
    await page.getByRole('button', { name: 'Good, 4 of 5' }).click();
    await expect.poll(() => writes.length).toBe(2);
    const second = Array.isArray(writes[1].body) ? writes[1].body[0] : writes[1].body;
    expect(second.sleep_quality).toBe(4);
    expect('sleep_hours' in second).toBe(false);
  });

  test('tapping a tile again closes it', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await page.goto('/dashboard');
    await settle(page);
    const tile = page.getByRole('button', { name: /^Mood/ });
    await tile.click();
    await expect(page.getByRole('group', { name: 'Mood' })).toBeVisible();
    await tile.click();
    await expect(page.getByRole('group', { name: 'Mood' })).toBeHidden();
  });

  test('a water tap no longer writes mood or energy', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const writes = recordWrites(page, 'checkins');
    await page.goto('/dashboard');
    await settle(page);
    // Water lives in the hero's glance tile: one tap adds 250ml.
    await page.getByRole('button', { name: /250ml/ }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    const body = Array.isArray(writes[0].body) ? writes[0].body[0] : writes[0].body;
    expect('energy' in body).toBe(false);
    expect('mood' in body).toBe(false);
  });
});

test.describe('fasting', () => {
  test('Quick add → Fasting opens the fasting page', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width > 860, 'bottom-nav "+" only exists on phones/tablets');
    await openApp({ page, context }, testInfo);
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: 'Quick add' }).click();
    await page.getByRole('button', { name: 'Fasting' }).click();
    await expect(page).toHaveURL(/\/fasting$/);
    await expect(page.getByText('Start a fast')).toBeVisible();
  });

  test('starting a 16:8 fast sends a 16-hour goal', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const writes = recordWrites(page, 'fasts');
    await page.goto('/fasting');
    await settle(page);
    await page.getByRole('button', { name: 'Start 16h fast' }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].body).toMatchObject({ user_id: USER_ID, target_hours: 16 });
  });

  test('a custom length must be valid before it can start', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await page.goto('/fasting');
    await settle(page);
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enter a length' })).toBeDisabled();
    await page.getByLabel('Fast length in hours').fill('100');
    await expect(page.getByRole('button', { name: 'Enter a length' })).toBeDisabled();
    await page.getByLabel('Fast length in hours').fill('20');
    await expect(page.getByRole('button', { name: 'Start 20h fast' })).toBeEnabled();
  });

  test('a running fast shows its clock; ending early asks first', async ({ page, context }, testInfo) => {
    const started = new Date(Date.now() - 5 * 3600000).toISOString();
    await openApp({ page, context }, testInfo, { tables: { fasts: [{ id: 'f1', user_id: USER_ID, started_at: started, target_hours: 16, ended_at: null, end_notified_at: null, created_at: started }] } });
    const writes = recordWrites(page, 'fasts');
    await page.goto('/fasting');
    await settle(page);
    await expect(page.getByLabel('Time fasted')).toHaveText(/^5:0\d:\d\d$/);
    await expect(page.getByText('of your 16h goal')).toBeVisible();
    await page.getByRole('button', { name: 'End fast' }).click();
    expect(writes).toHaveLength(0); // nothing sent until confirmed
    await expect(page.getByText(/short of your goal/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep fasting' }).click();
    await expect(page.getByRole('button', { name: 'End fast' })).toBeVisible();
    await page.getByRole('button', { name: 'End fast' }).click();
    await page.getByRole('button', { name: 'Yes, end fast' }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].body.ended_at).toBeTruthy();
  });

  test('a fast that has reached its goal ends in one tap', async ({ page, context }, testInfo) => {
    const started = new Date(Date.now() - 17 * 3600000).toISOString();
    await openApp({ page, context }, testInfo, { tables: { fasts: [{ id: 'f1', user_id: USER_ID, started_at: started, target_hours: 16, ended_at: null, end_notified_at: null, created_at: started }] } });
    const writes = recordWrites(page, 'fasts');
    await page.goto('/fasting');
    await settle(page);
    await expect(page.getByText('Goal reached').first()).toBeVisible();
    await page.getByRole('button', { name: 'End fast' }).click();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect(writes[0].method).toBe('PATCH');
  });

  test('says so, rather than showing a dead timer, when the table is not in the database yet', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await page.route('**/rest/v1/fasts*', (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.fasts' in the schema cache", details: null, hint: null }) }));
    await page.goto('/fasting');
    await settle(page);
    await expect(page.getByText(/isn't switched on for this account yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Start/ })).toHaveCount(0);
  });
});

test.describe('quick add sheet', () => {
  // Regression: the sheet used to capture the pointer on press, which in Chrome
  // sent the click to the panel — so no row or tile in it did anything.
  test('its rows actually navigate when tapped', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width > 860, 'bottom-nav "+" only exists on phones/tablets');
    await openApp({ page, context }, testInfo);
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: 'Quick add' }).click();
    await page.getByRole('button', { name: 'Log weight' }).click();
    await expect(page).toHaveURL(/\/expenditure$/);
  });

  test('dragging the sheet down still dismisses it', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width > 860, 'bottom-nav "+" only exists on phones/tablets');
    await openApp({ page, context }, testInfo);
    await page.goto('/dashboard');
    await settle(page);
    await page.getByRole('button', { name: 'Quick add' }).click();
    const sheet = page.locator('.modal-panel');
    const grab = sheet.getByRole('button', { name: 'Log food' });
    await grab.waitFor();
    const box = await grab.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 12 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
