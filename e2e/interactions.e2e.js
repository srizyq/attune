import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Layout bugs love modals, sheets, menus and expanded rows — the parts of the
// app you only see after tapping something. Each scenario opens one and runs
// the same checks (the modal's own scroll area is scrolled to its end too).
const SCENARIOS = [
  { name: 'quick-add-sheet', path: '/dashboard', mobileOnly: true, act: (p) => p.getByRole('button', { name: 'Quick add' }).click() },
  { name: 'settings-notifications', path: '/settings', act: (p) => p.getByRole('button', { name: /Notifications/ }).first().click() },
  { name: 'settings-coach', path: '/settings', act: (p) => p.getByRole('button', { name: /Coach Mode/ }).first().click() },
  { name: 'settings-privacy', path: '/settings', act: (p) => p.getByRole('button', { name: /Privacy/ }).first().click() },
  { name: 'dashboard-log-workout', path: '/dashboard', act: (p) => p.getByRole('button', { name: /Log workout/ }).click() },
  { name: 'dashboard-log-weight', path: '/dashboard', act: (p) => p.getByText('WEIGHT', { exact: true }).first().click() },
  { name: 'dashboard-meals-view', path: '/dashboard', act: async (p) => { await p.getByRole('button', { name: 'Meals' }).first().click(); } },
  { name: 'dashboard-expand-log-item', path: '/dashboard', act: async (p) => { await p.getByRole('button', { name: 'Meals' }).first().click(); await p.getByText('Breakfast').first().click(); } },
  { name: 'daily-log-copy-menu', path: '/log', act: (p) => p.getByRole('button', { name: 'Copy meals' }).click() },
  { name: 'daily-log-copy-modal', path: '/log', act: async (p) => { await p.getByRole('button', { name: 'Copy meals' }).click(); await p.getByText('Copy from another day').click(); } },
  // 'Meals' also substring-matches this page's "Copy meals" header button,
  // and its icon glyph's CSS ::before content is folded into the computed
  // accessible name, so `exact: true` never matches literally "Meals"
  // either — .last() works because "Copy meals" sits earlier in the DOM
  // than the view toggle. Switches to the Meals-grouped list so this
  // exercises that layout, not Hourly (which shows the same item too).
  { name: 'daily-log-edit-item', path: '/log', act: async (p) => { await p.getByRole('button', { name: 'Meals' }).last().click(); await p.getByText('Grilled chicken').first().click(); } },
  { name: 'food-create-custom', path: '/food', act: (p) => p.getByTitle('Create a custom food').click() },
  { name: 'food-expand-result', path: '/food', act: async (p) => { await p.getByText('Almonds').first().click(); } },
  { name: 'food-search-typing', path: '/food', act: async (p) => { await p.getByPlaceholder(/Search any food/).fill('chicken breast with a very long search phrase that keeps going'); } },
  { name: 'expenditure-log-weight', path: '/expenditure', act: (p) => p.getByRole('button', { name: /Log weight/ }).first().click() },
  { name: 'profile-logout-confirm', path: '/profile', backend: { session: { is_anonymous: true, email: '', new_email: 'sam@example.test' } }, act: (p) => p.getByRole('button', { name: 'Log out' }).click() },
  { name: 'insights-mood-picked', path: '/insights', act: async (p) => { await p.getByText('Great', { exact: true }).click(); await p.getByRole('button', { name: '7', exact: true }).click(); } },
  { name: 'food-created-tab', path: '/food', act: (p) => p.getByRole('button', { name: 'Created' }).click() },
  {
    name: 'settings-goals-type-calories',
    path: '/settings/goals',
    act: async (p) => {
      await p.getByRole('button', { name: 'Custom', exact: true }).click();
      await p.getByLabel('Calorie target').click();
      await p.getByLabel('Calorie target').fill('1850');
      await p.getByLabel('Calorie target').blur();
    },
  },
  {
    name: 'settings-goals-type-macro',
    path: '/settings/goals',
    act: async (p) => {
      await p.getByLabel('Protein percent of calories').click();
      await p.getByLabel('Protein percent of calories').fill('45');
      await p.getByLabel('Protein percent of calories').blur();
    },
  },
  {
    // Meals view (not Hourly's default) — Hourly wraps each item in an
    // extra hour-segment toggle whose preview text also reads "Grilled
    // chicken…", so a single click there opens the segment, not the item.
    name: 'daily-log-edit-item-save-bar',
    path: '/log',
    act: async (p) => {
      await p.getByRole('button', { name: 'Meals' }).last().click();
      await p.getByText('Grilled chicken').first().click();
      await p.getByRole('button', { name: 'Save', exact: true }).waitFor();
    },
  },
];

for (const sc of SCENARIOS) {
  test(sc.name, async ({ page, context }, testInfo) => {
    test.skip(sc.mobileOnly && !testInfo.project.use.isMobile, 'bottom-nav "+" only exists on phones/tablets');
    const ctx = await openApp({ page, context }, testInfo, sc.backend);
    await page.goto(sc.path);
    await settle(page);
    await sc.act(page);
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname, 'should still be on the same screen').toBe(sc.path);
    await assertLayout(page, testInfo, `x-${sc.name}`, ctx);
  });
}
