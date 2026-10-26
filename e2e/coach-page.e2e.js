import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { findLayoutProblems } from './deviceCheck.js';
import { COACH_BACKEND, COACH_BACKEND_MANY, clientCard } from './coachFixtures.js';

// Coach page: a "Coach" title (like the Friends tab), then Friends | Coach, the
// greeting line, then the clients — no My clients | My coach switch (most coaches
// have no coach of their own; it's a link at the bottom). Each client is its own
// card with their most urgent reason as a tag inside it, and a client opens in a
// page with one slim header and four tabs that fit.
const top = async (loc) => (await loc.boundingBox()).y;

test('title Coach, then Friends | Coach, then the greeting, then the clients', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  const title = page.getByRole('heading', { name: 'Coach', exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText('Coach Mode')).toHaveCount(0);
  const friendsCoach = page.getByRole('tablist', { name: 'Friends sections' });
  const greeting = page.getByText(/need attention/).first();
  const firstClient = clientCard(page, 'Amogh Joshi');
  await expect(friendsCoach).toBeVisible();
  await expect(firstClient).toBeVisible();
  await expect(page.getByRole('button', { name: 'My coach' })).toHaveCount(0);
  const [a, b, c] = [await top(friendsCoach), await top(greeting), await top(firstClient)];
  expect(await top(title), 'the Coach title is above Friends | Coach').toBeLessThan(a);
  expect(a, 'Friends | Coach is above the greeting').toBeLessThan(b);
  expect(b, 'the greeting is above the first client').toBeLessThan(c);
  await assertLayout(page, testInfo, 'x-coach-clients', ctx);
});

test('each client is a card; one reason is a tag inside it and never touches another card', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  const cards = page.locator('div[role="button"].btn-press');
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

test('a short list has just the clients; search and sort appear only on a long one', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByLabel('Search clients')).toHaveCount(0);
  await expect(page.getByLabel('Sort clients')).toHaveCount(0);
});

test('with twelve clients: search, filters and sort are there, and the % explanation is behind the (i)', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND_MANY);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByText(/is 7-day adherence/)).toHaveCount(0);
  await page.getByRole('button', { name: 'About the percentage' }).click();
  await expect(page.getByText(/is 7-day adherence/)).toBeVisible();
  await expect(page.getByLabel('Search clients')).toBeVisible();
  await page.getByLabel('Sort clients').selectOption('name');
  await expect(page.locator('div[role="button"].btn-press').first()).toContainText('A client with a rather long name');
  await assertLayout(page, testInfo, 'x-coach-many-clients', ctx);
});

test('inviting is folded away once there are clients, and the + opens it', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByRole('button', { name: /Invite a client/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/Each invite works once/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a client' }).click();
  await expect(page.getByText(/Each invite works once/)).toBeVisible();
});

test('a client opens with one slim header, data near the top, and four tabs that all fit', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await clientCard(page, 'Tarun').click();
  await settle(page);
  // Header: back, name, Messages, ⋯ — and no loose Disconnect / group buttons on the page.
  await expect(page.getByRole('button', { name: 'All clients' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarun' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Messages' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect client' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Coach', exact: true })).toHaveCount(0); // the page header is the client's
  for (const name of ['All clients', 'Messages', 'More actions']) expect((await page.getByRole('button', { name }).boundingBox()).height, name).toBeGreaterThanOrEqual(40);
  // Four tabs, all visible, nothing scrolling sideways.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  const fits = await page.getByRole('tablist', { name: 'Client sections' }).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits, 'the four tabs fit without scrolling').toBe(true);
  // The first real content starts in the top part of the screen, not under a stack of headers.
  if (testInfo.project.name === 'phone') {
    const panelTop = await top(page.getByRole('tabpanel'));
    expect(panelTop, 'content starts near the top on a phone').toBeLessThan(300);
  }
  // Every tab, probed for overflow, tiny tap targets and errors.
  for (const tab of ['Snapshot', 'Diary', 'Progress', 'Plan']) {
    await page.getByRole('tab', { name: tab }).click();
    await settle(page);
    await assertLayout(page, testInfo, `x-coach-client-${tab.toLowerCase()}`, ctx);
  }
  // The ⋯ menu holds the occasional actions, including group and (confirmed) disconnect.
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Set group' })).toContainText('Add to a group');
  await expect(page.getByRole('menuitem', { name: 'Disconnect client' })).toContainText('Disconnect');
  for (const name of ['Set group', 'Disconnect client', 'Export a report']) expect((await page.getByRole('menuitem', { name }).boundingBox()).height, name).toBeGreaterThanOrEqual(44);
  await assertLayout(page, testInfo, 'x-coach-client-menu', ctx);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'All clients' }).click();
  await expect(clientCard(page, 'Tarun')).toBeVisible();
});

test('Messages opens as a sheet from any tab, with quick messages, and Reports is inside Progress', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await clientCard(page, 'Tarun').click();
  await page.getByRole('tab', { name: 'Diary' }).click();
  await page.getByRole('button', { name: 'Messages' }).click();
  const sheet = page.getByRole('group', { name: 'Quick messages' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByPlaceholder(/Leave a note for Tarun/)).toHaveValue(/^Hi Tarun — just checking in/);
  await assertLayout(page, testInfo, 'x-coach-messages-sheet', ctx);
  // Reports: not a tab; a row at the bottom of Progress that opens the builder.
  await expect(page.getByRole('tab', { name: 'Reports' })).toHaveCount(0);
});

test('"Message" on a card opens that client straight to their messages', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await page.getByRole('button', { name: 'Message Tarun' }).click();
  await expect(page.getByRole('group', { name: 'Quick messages' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true'); // the page underneath is the Snapshot
});

test('your own coach is a link at the bottom, with a way back', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await page.getByRole('button', { name: /Your own coach/ }).click();
  await expect(page.getByText(/Not connected to a trainer yet/)).toBeVisible();
  await page.getByRole('button', { name: /My clients/ }).click();
  await expect(clientCard(page, 'Tarun')).toBeVisible();
});

test('a coach\'s bottom nav says Coach, not Friends, and stays lit on both', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'bottom nav is phone/tablet only');
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  const nav = page.locator('.app-bottom-nav');
  await expect(nav.getByTitle('Coach')).toBeVisible();
  await expect(nav.getByTitle('Friends')).toHaveCount(0);
  await expect(nav.locator('.app-bottom-icon-content.is-active')).toContainText('Coach');
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
      await clientCard(page, 'Tarun').click();
      await settle(page);
      for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${width}x${height} client: ${p.check} — ${p.msg}`);
    }
    expect(problems).toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  });
}
