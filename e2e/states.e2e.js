import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { buildFoodLogs } from './fixtures.js';
import { SCREENS } from './screenList.js';

// The same screens under the account states that tend to break layouts:
// empty accounts, free tier, trial banners, an unconfirmed email, and text
// that's much longer than anyone designed for.
const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
const LONG_UNBROKEN = 'Supercalifragilisticexpialidocious_and_then_some_more_characters_without_any_spaces_at_all_1234567890';
const LONG_NAME = 'Bartholomew-Maximilian Featherstonehaugh-Cholmondeley the Third of Westminster';

const STATES = [
  {
    name: 'empty-account',
    backend: { tables: { food_logs: [], weight_logs: [], workout_logs: [], checkins: [], custom_foods: [], favourite_foods: [], saved_meals: [] }, profile: { is_premium: false, pro_status: null, stripe_pro_subscription_id: null, stripe_customer_id: null, daily_log_view: null, weight: null, target_weight: null } },
    screens: SCREENS.map((s) => s.name),
  },
  {
    name: 'free-tier',
    backend: { profile: { is_premium: false, pro_status: null, stripe_pro_subscription_id: null, stripe_customer_id: null, daily_log_view: null } },
    screens: ['dashboard', 'daily-log', 'food-search', 'settings', 'profile', 'insights', 'nutrients'],
  },
  {
    name: 'trial-ending',
    backend: { profile: { is_premium: false, pro_status: null, stripe_pro_subscription_id: null, stripe_customer_id: null, trial_ends_at: day(4) } },
    screens: ['dashboard', 'settings', 'profile'],
  },
  {
    name: 'trial-ended',
    backend: { profile: { is_premium: false, pro_status: null, stripe_pro_subscription_id: null, stripe_customer_id: null, trial_ends_at: day(-1) } },
    screens: ['dashboard', 'settings'],
  },
  {
    name: 'unconfirmed-email',
    backend: { session: { is_anonymous: true, email: '', new_email: 'a.very.long.email.address.for.layout.testing@some-extremely-long-domain-name-example.com' } },
    screens: ['dashboard', 'settings', 'profile', 'coach'],
  },
  {
    name: 'long-text',
    backend: {
      profile: { name: LONG_NAME },
      tables: {
        food_logs: buildFoodLogs().map((r, i) => (i % 3 === 0 ? { ...r, food_name: LONG_UNBROKEN } : i % 3 === 1 ? { ...r, food_name: `${r.food_name} — ${r.food_name} with extra sauce, sides and a very long description of how it was cooked` } : r)),
      },
    },
    screens: ['dashboard', 'daily-log', 'food-search', 'settings', 'profile', 'nutrients'],
  },
  {
    name: 'coach',
    backend: { profile: { coach_pass: true, coach_mode: true, coach_invite_code: 'ABCD1234', coach_pass_status: 'active' } },
    screens: ['coach', 'settings', 'dashboard'],
  },
];

for (const state of STATES) {
  for (const name of state.screens) {
    const screen = SCREENS.find((s) => s.name === name);
    test(`${state.name} · ${name}`, async ({ page, context }, testInfo) => {
      const ctx = await openApp({ page, context }, testInfo, state.backend);
      await page.goto(screen.path);
      await settle(page);
      expect(new URL(page.url()).pathname, 'should not have been redirected away').toBe(screen.path);
      await assertLayout(page, testInfo, `${state.name}-${name}`, ctx);
    });
  }
}
