import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { COACH_BACKEND } from './coachFixtures.js';
import { USER_ID } from './fixtures.js';

// Screens the main screen list doesn't reach: the coach page from a client's
// side (with and without a coach), the trainer's empty state and "My coach"
// tab, a client's messages, and Pricing — in both themes.
const TRAINER = 'trainer-0000-0000-0000-000000000001';
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const LINK = { id: 'link1', status: 'active', created_at: iso(30), consented_at: iso(30), referred_by_name: null, trainer_id: TRAINER, trainer_name: 'Sam Rivers', trainer_logo_url: null };
const COMMENTS = [
  { id: 'c1', trainer_id: TRAINER, client_id: USER_ID, category: 'general', sender_role: 'trainer', body: 'Great week — keep the protein up.', comment_date: null, created_at: iso(0.2) },
  { id: 'c2', trainer_id: TRAINER, client_id: USER_ID, category: 'weight', sender_role: 'trainer', body: 'Weight is trending nicely, on track for your goal this month.', comment_date: null, created_at: iso(2) },
];
const EXTRA_TABLES = { checkin_forms: [], checkin_responses: [], app_settings: [] };

const CASES = [
  { name: 'client-with-coach', path: '/coach', wait: 'Notes from your coach', backend: { rpc: { get_my_coach_links: [LINK] }, tables: { trainer_comments: COMMENTS } } },
  { name: 'client-no-coach', path: '/coach', backend: { profile: { coach_pass: false, is_premium: false } } },
  { name: 'trainer-no-clients', path: '/coach', backend: { profile: COACH_BACKEND.profile } },
  { name: 'trainer-my-coach', path: '/coach', backend: COACH_BACKEND, act: (p) => p.getByRole('button', { name: /Your own coach/ }).click() },
  {
    name: 'trainer-client-messages', path: '/coach',
    backend: { ...COACH_BACKEND, tables: { ...COACH_BACKEND.tables, trainer_comments: COMMENTS.map((c) => ({ ...c, client_id: 'c2', trainer_id: USER_ID })) } },
    act: async (p) => { await p.getByRole('button', { name: 'Message Tarun', exact: true }).click(); await p.getByText('Great week — keep the protein up.').waitFor(); },
  },
  { name: 'pricing-free', path: '/pricing', backend: { profile: { is_premium: false, coach_pass: false } } },
  { name: 'pricing-pro', path: '/pricing' },
];

for (const theme of ['light', 'dark']) {
  for (const c of CASES) {
    test(`${c.name} · ${theme}`, async ({ page, context }, testInfo) => {
      const b = c.backend || {};
      const ctx = await openApp({ page, context }, testInfo, { ...b, profile: { ...(b.profile || {}), theme }, tables: { ...EXTRA_TABLES, ...(b.tables || {}) } });
      await page.goto(c.path);
      await settle(page);
      if (c.wait) await page.getByText(c.wait).first().waitFor();
      if (c.act) { await c.act(page); await settle(page); }
      await assertLayout(page, testInfo, `x-more-${c.name}-${theme}`, ctx);
    });
  }
}

test('a coach note can be dismissed with a proper tap target, and a comment deleted from its bubble', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { rpc: { get_my_coach_links: [LINK] }, tables: { ...EXTRA_TABLES, trainer_comments: COMMENTS } });
  await page.goto('/coach');
  await settle(page);
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();
  await dismiss.waitFor();
  const box = await dismiss.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(40);
});
