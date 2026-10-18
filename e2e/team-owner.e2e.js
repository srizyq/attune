import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { COACH_BACKEND, TEAM_OWNER_BACKEND, TEAM } from './coachFixtures.js';

// The owner of a coach team can read their teammates' clients (never edit, never
// messages or private notes), and a client is told when this applies to them.
async function openTeamClients(page) {
  await page.goto('/coach');
  await settle(page);
  await page.getByRole('button', { name: 'Team clients' }).click();
}

test('an owner gets a Team clients list, with each client\'s coach on it', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, TEAM_OWNER_BACKEND);
  await openTeamClients(page);
  await expect(page.getByRole('button', { name: /Kai Teamclient/ })).toBeVisible();
  await expect(page.getByText('Coach: Mia Mate')).toBeVisible();
  // Their own clients are not in this list, and there is no message filter (messages stay private).
  await expect(page.getByRole('button', { name: /Amogh Joshi/ })).toHaveCount(0);
  await expect(page.getByText(/^Unread/)).toHaveCount(0);
  await assertLayout(page, testInfo, 'x-team-clients', ctx);
  await page.getByRole('button', { name: 'My clients' }).click();
  await expect(page.getByRole('button', { name: /Amogh Joshi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Kai Teamclient/ })).toHaveCount(0);
});

test('a teammate\'s client opens read-only: the data, no editing, no messages, no plan', async ({ page, context }, testInfo) => {
  const ctx = await openApp({ page, context }, testInfo, TEAM_OWNER_BACKEND);
  await openTeamClients(page);
  await page.getByRole('button', { name: /Kai Teamclient/ }).click();
  await expect(page.getByText('Coach: Mia Mate · View only')).toBeVisible();
  for (const tab of ['Overview', 'Diary', 'Progress', 'Reports']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  for (const tab of ['Messages', 'Plan']) await expect(page.getByRole('tab', { name: tab })).toHaveCount(0);
  // Nothing on the Overview invites an edit.
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set group' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect client' })).toHaveCount(0);
  await expect(page.getByText('Calorie target', { exact: true }).first()).toBeVisible();
  await assertLayout(page, testInfo, 'x-team-client-overview', ctx);
  await page.getByRole('tab', { name: 'Diary' }).click();
  await expect(page.getByTestId('day-summary')).toBeVisible();
  await page.getByRole('button', { name: /All team clients/ }).click();
  await expect(page.getByRole('button', { name: /Kai Teamclient/ })).toBeVisible();
});

test('a team member who is not the owner has no Team clients tab', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { ...TEAM_OWNER_BACKEND, rpc: { ...TEAM_OWNER_BACKEND.rpc, get_my_team: TEAM(false) } });
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByRole('button', { name: 'My clients' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Team clients' })).toHaveCount(0);
});

test('an owner whose team has nobody else on it has no Team clients tab', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { ...TEAM_OWNER_BACKEND, rpc: { ...TEAM_OWNER_BACKEND.rpc, get_my_team: TEAM(true, [{ user_id: 'me', name: 'Coach Sam', role: 'owner', joined_at: '2026-10-01T00:00:00Z', client_count: 3, has_pass: true }]) } });
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Team clients' })).toHaveCount(0);
});

test('a coach not on any team has no Team clients tab', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Team clients' })).toHaveCount(0);
});

test('the Team card tells owners and members what the owner can see', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, TEAM_OWNER_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByText(/You can view your teammates' clients, read-only/)).toBeVisible();
});

test('a member is told the owner can view their clients', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { ...TEAM_OWNER_BACKEND, rpc: { ...TEAM_OWNER_BACKEND.rpc, get_my_team: TEAM(false) } });
  await page.goto('/coach');
  await settle(page);
  await expect(page.getByText(/The team owner can view your clients, read-only/)).toBeVisible();
});

test.describe('as a client of a coach on a team', () => {
  const LINK = { id: 'link-1', status: 'active', created_at: '2026-10-01T00:00:00Z', consented_at: '2026-10-01T00:00:00Z', trainer_id: 'mate-id', trainer_name: 'Mia Mate', trainer_logo_url: null, referred_by_name: null, team_owner_name: 'Olive Owner' };

  test('the Coach tab says the team\'s owner can also view their data', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { get_my_coach_links: [LINK] } });
    await page.goto('/coach');
    await settle(page);
    await expect(page.getByTestId('team-owner-notice')).toContainText("Olive Owner, who owns Mia Mate's team, can also view this");
    await expect(page.getByTestId('team-owner-notice')).toContainText("can't edit it or see your messages");
  });

  test('an invitation to connect says it before they accept', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { get_my_coach_links: [{ ...LINK, status: 'pending', consented_at: null }] } });
    await page.goto('/coach');
    await settle(page);
    await expect(page.getByTestId('team-owner-notice')).toContainText('Olive Owner');
    await expect(page.getByRole('button', { name: 'Accept and connect' })).toBeVisible();
  });

  test('nothing extra is said when the coach is not on a team', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo, { rpc: { get_my_coach_links: [{ ...LINK, team_owner_name: null }] } });
    await page.goto('/coach');
    await settle(page);
    await expect(page.getByText('Mia Mate').first()).toBeVisible();
    await expect(page.getByTestId('team-owner-notice')).toHaveCount(0);
  });
});
