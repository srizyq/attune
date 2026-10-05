import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { USER_ID } from './fixtures.js';

// Layout bugs love modals, sheets, menus and expanded rows — the parts of the
// app you only see after tapping something. Each scenario opens one and runs
// the same checks (the modal's own scroll area is scrolled to its end too).
const RESTAURANT_BACKEND = {
  tables: {
    restaurant_chains: [{ id: 'mcdonalds-au', name: "McDonald's", country: 'AU', category: 'burgers' }],
    restaurant_items: ['Big Mac', 'Quarter Pounder', 'McChicken'].map((name, i) => ({ id: `mcdonalds-au_${i}`, chain_id: 'mcdonalds-au', chain_name: "McDonald's", name, category: 'Burgers', size_label: null, serving_label: '1 burger', serving_grams: 200, calories: 500 + i * 20, protein_g: 25, carbs_g: 40, fat_g: 25, fibre_g: 3, sodium_mg: 900, sugar_g: 8 }))
      .concat([{ id: 'mcdonalds-au_f', chain_id: 'mcdonalds-au', chain_name: "McDonald's", name: 'Medium Fries', category: 'Sides', size_label: null, serving_label: '1 serve', serving_grams: 111, calories: 337, protein_g: 4, carbs_g: 41, fat_g: 17, fibre_g: 4, sodium_mg: 200, sugar_g: 0 }]),
  },
};

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const fastRow = (over) => ({ id: 'fast-1', user_id: USER_ID, started_at: hoursAgo(5), target_hours: 16, ended_at: null, end_notified_at: null, created_at: hoursAgo(5), ...over });
const RUNNING_FAST = { tables: { fasts: [fastRow()] } };
const FAST_WITH_HISTORY = { tables: { fasts: [fastRow(), fastRow({ id: 'fast-0', started_at: hoursAgo(48), ended_at: hoursAgo(30), target_hours: 16 }), fastRow({ id: 'fast--1', started_at: hoursAgo(80), ended_at: hoursAgo(70), target_hours: 16 })] } };

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
  { name: 'daily-log-copy-modal-picked', path: '/log', act: async (p) => { await p.getByRole('button', { name: 'Copy meals' }).click(); await p.getByText('Copy from another day').click(); await p.getByRole('radio', { name: 'Dinner' }).click(); await p.getByRole('checkbox', { name: /Lunch/ }).first().click(); } },
  // 'Meals' also substring-matches this page's "Copy meals" header button,
  // and its icon glyph's CSS ::before content is folded into the computed
  // accessible name, so `exact: true` never matches literally "Meals"
  // either — .last() works because "Copy meals" sits earlier in the DOM
  // than the view toggle. Explicit click keeps this self-contained
  // regardless of the fixture profile's own daily_log_view default.
  { name: 'daily-log-edit-item', path: '/log', act: async (p) => { await p.getByRole('button', { name: 'Meals' }).last().click(); await p.getByText('Grilled chicken').first().click(); } },
  // 1M / 3M show one bar per week; before that, 30-90 hidden date labels each
  // took up width and pushed the calorie card off the right of the screen.
  { name: 'dashboard-chart-1m', path: '/dashboard', act: async (p) => { await p.getByRole('button', { name: '1M', exact: true }).click(); } },
  { name: 'dashboard-chart-3m', path: '/dashboard', act: async (p) => { await p.getByRole('button', { name: '3M', exact: true }).click(); } },
  // Searching a chain's name (or nickname) offers the chain itself; its card
  // opens a menu page with only that chain's items.
  { name: 'food-restaurant-card', path: '/food', backend: RESTAURANT_BACKEND, act: async (p) => { await p.getByPlaceholder(/Search any food/).fill('maccas'); await p.getByRole('button', { name: /McDonald's/ }).waitFor(); } },
  { name: 'food-restaurant-menu', path: '/food', backend: RESTAURANT_BACKEND, act: async (p) => { await p.getByPlaceholder(/Search any food/).fill('maccas'); await p.getByRole('button', { name: /McDonald's/ }).click(); await p.getByRole('heading', { name: "McDonald's" }).waitFor(); await p.getByRole('tab', { name: /Burgers/ }).click(); await p.getByText('Big Mac').first().waitFor(); } },
  { name: 'food-create-custom', path: '/food', act: (p) => p.getByTitle('Create a custom food').click() },
  { name: 'food-expand-result', path: '/food', act: async (p) => { await p.getByText('Almonds').first().click(); } },
  { name: 'food-search-typing', path: '/food', act: async (p) => { await p.getByPlaceholder(/Search any food/).fill('chicken breast with a very long search phrase that keeps going'); } },
  { name: 'expenditure-log-weight', path: '/expenditure', act: (p) => p.getByRole('button', { name: /Log weight/ }).first().click() },
  { name: 'profile-logout-confirm', path: '/profile', backend: { session: { is_anonymous: true, email: '', new_email: 'sam@example.test' } }, act: (p) => p.getByRole('button', { name: 'Log out' }).click() },
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
  { name: 'dashboard-checkin-mood', path: '/dashboard', act: (p) => p.getByRole('button', { name: /^Mood/ }).click() },
  { name: 'dashboard-checkin-energy', path: '/dashboard', act: (p) => p.getByRole('button', { name: /^Energy/ }).click() },
  { name: 'dashboard-checkin-sleep', path: '/dashboard', act: (p) => p.getByRole('button', { name: /^Sleep/ }).click() },
  { name: 'fasting-custom-length', path: '/fasting', act: async (p) => { await p.getByRole('button', { name: 'Custom', exact: true }).click(); await p.getByLabel('Fast length in hours').fill('20.5'); } },
  { name: 'fasting-running', path: '/fasting', backend: FAST_WITH_HISTORY, act: (p) => p.getByText('of your 16h goal').waitFor() },
  { name: 'fasting-goal-reached', path: '/fasting', backend: { tables: { fasts: [fastRow({ started_at: hoursAgo(17.5) })] } }, act: (p) => p.getByText('Goal reached').first().waitFor() },
  { name: 'fasting-end-confirm', path: '/fasting', backend: RUNNING_FAST, act: (p) => p.getByRole('button', { name: 'End fast' }).click() },
  { name: 'fasting-discard-confirm', path: '/fasting', backend: RUNNING_FAST, act: (p) => p.getByRole('button', { name: /Discard/ }).click() },
  {
    // Explicit click into Meals view, same reasoning as daily-log-edit-item
    // above.
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
    test.skip(sc.mobileOnly && testInfo.project.use.viewport.width > 860, 'bottom-nav "+" only exists on phones/tablets (<=860px, AppNav.jsx\'s breakpoint)');
    const ctx = await openApp({ page, context }, testInfo, sc.backend);
    await page.goto(sc.path);
    await settle(page);
    await sc.act(page);
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname, 'should still be on the same screen').toBe(sc.path);
    await assertLayout(page, testInfo, `x-${sc.name}`, ctx);
  });
}
