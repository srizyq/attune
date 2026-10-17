import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';
import { COACH_BACKEND } from './coachFixtures.js';

// Coach page: Friends | Coach is the very first thing, then the greeting line,
// then My clients | My coach. No "Coach Mode" title. Each client is its own
// card with their reasons as tags inside it.
const top = async (loc) => (await loc.boundingBox()).y;

test('Friends | Coach first, then the greeting, then My clients | My coach; no title', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByText('Coach Mode')).toHaveCount(0);
  const friendsCoach = page.getByRole('tablist', { name: 'Friends sections' });
  const greeting = page.getByText(/need attention/).first();
  const myClients = page.getByRole('button', { name: 'My clients' });
  await expect(friendsCoach).toBeVisible();
  await expect(myClients).toBeVisible();
  const [a, b, c] = [await top(friendsCoach), await top(greeting), await top(myClients)];
  expect(a, 'Friends | Coach is above the greeting').toBeLessThan(b);
  expect(b, 'the greeting is above My clients | My coach').toBeLessThan(c);
  await assertLayout(page, testInfo, 'x-coach-clients', ctx);
});

test('each client is a card; reasons are tags inside it and never touch another card', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  const cards = page.getByRole('button', { name: /Amogh Joshi|Tarun|A client with a rather long name/ });
  await expect(cards).toHaveCount(3);
  await expect(page.getByText('Never logged')).toBeVisible();
  await expect(page.getByText(/Hasn’t logged anything yet/)).toBeVisible();
  const boxes = [];
  for (let i = 0; i < 3; i++) boxes.push(await cards.nth(i).boundingBox());
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, 'cards stack without overlapping').toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height);
  // Every tag sits fully inside its card.
  const tagsInside = await page.evaluate(() => [...document.querySelectorAll('[role="button"].btn-press')].every((card) => {
    const cr = card.getBoundingClientRect();
    return [...card.querySelectorAll('span')].every((t) => { const r = t.getBoundingClientRect(); return r.bottom <= cr.bottom + 0.5 && r.top >= cr.top - 0.5 && r.right <= cr.right + 0.5; });
  }));
  expect(tagsInside).toBe(true);
});

test('the % explanation is behind the (i), and sort is one tidy button', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByText(/is 7-day adherence/)).toHaveCount(0);
  await page.getByRole('button', { name: 'About the percentage' }).click();
  await expect(page.getByText(/is 7-day adherence/)).toBeVisible();
  await page.getByLabel('Sort clients').selectOption('name');
  await expect(page.getByRole('button', { name: /Amogh Joshi|Tarun|A client with/ }).first()).toContainText('A client with a rather long name');
});

test('a client opens with a back button, labelled group / disconnect buttons, and tabs that fit', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await page.getByRole('button', { name: /Tarun/ }).click();
  await expect(page.getByRole('button', { name: /All clients/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set group' })).toContainText('Add to group');
  await expect(page.getByRole('button', { name: 'Disconnect client' })).toContainText('Disconnect');
  for (const name of ['Set group', 'Disconnect client']) expect((await page.getByRole('button', { name }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Every tab of the client, probed for overflow, tiny tap targets and errors.
  for (const tab of ['Overview', 'Diary', 'Progress', 'Messages', 'Plan', 'Reports']) {
    await page.getByRole('tab', { name: tab }).click();
    await settle(page);
    await assertLayout(page, testInfo, `x-coach-client-${tab.toLowerCase()}`, ctx);
  }
  await page.getByRole('button', { name: /All clients/ }).click();
  await expect(page.getByRole('button', { name: 'My clients' })).toBeVisible();
});

const SIZES = [[280, 653], [320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [744, 1133], [1280, 720]];
for (const theme of ['light', 'dark']) {
  test(`coach list and client page fit every device size · ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
    test.setTimeout(150000);
    const ctx = await openApp({ page, context }, testInfo, { ...COACH_BACKEND, profile: { ...COACH_BACKEND.profile, theme } });
    const problems = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto('/coach');
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} list: ${p.check} — ${p.msg}`);
      await page.getByRole('button', { name: /Tarun/ }).click();
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} client: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
