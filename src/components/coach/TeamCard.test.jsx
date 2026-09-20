// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({}));
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => h.team }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
import TeamCard from './TeamCard';

h.auth = { user: { id: 'me' } };
const member = (over) => ({ user_id: 'x', name: 'Mia Mate', role: 'member', client_count: 3, has_pass: true, ...over });
const inTeam = (over = {}, teamOver = {}) => ({
  id: 't1', name: 'Northside', is_owner: true, max_members: 25, invites: [],
  members: [member({ user_id: 'me', name: 'Olive Owner', role: 'owner', client_count: 1 }), member({ user_id: 'm1' })],
  ...over, ...teamOver,
});
const setup = (team, hook = {}) => {
  h.team = {
    supported: true, loading: false, team,
    create: vi.fn().mockResolvedValue(undefined), join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined),
    disband: vi.fn().mockResolvedValue(undefined), invite: vi.fn().mockResolvedValue(undefined), revokeInvite: vi.fn().mockResolvedValue(undefined),
    ...hook,
  };
  render(<TeamCard />);
  return h.team;
};
beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TeamCard — not on a team', () => {
  it('renders nothing while loading or before the database update', () => {
    setup(null, { loading: true });
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
    cleanup();
    setup(null, { supported: false });
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
  });

  it('creates a team with a trimmed name', async () => {
    const t = setup(null);
    await userEvent.type(screen.getByLabelText('Start a team'), '  Northside Physio  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(t.create).toHaveBeenCalledWith('Northside Physio');
  });

  it('will not create an unnamed team, and says why', async () => {
    const t = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the team a name');
    expect(t.create).not.toHaveBeenCalled();
  });

  it('joins with a code, tidied up (spaces and case forgiven)', async () => {
    const t = setup(null);
    await userEvent.type(screen.getByLabelText('Or join one'), ' ab cd2345 ');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(t.join).toHaveBeenCalledWith('ABCD2345');
  });

  it('will not join with no code', async () => {
    const t = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the invite code');
    expect(t.join).not.toHaveBeenCalled();
  });

  it('shows the database\'s reason when joining fails, and stays usable', async () => {
    const t = setup(null, { join: vi.fn().mockRejectedValue(new Error('That invite code is invalid or no longer active')) });
    await userEvent.type(screen.getByLabelText('Or join one'), 'ZZZZZZZZ');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or no longer active');
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    expect(t.join).toHaveBeenCalledTimes(1);
  });

  it('explains that clients are never shared without their say-so', () => {
    setup(null);
    expect(screen.getByText(/never shared unless they agree/)).toBeInTheDocument();
  });
});

describe('TeamCard — on a team', () => {
  it('lists members with client counts (counts only) and marks the owner and you', () => {
    setup(inTeam());
    expect(screen.getByText('Northside')).toBeInTheDocument();
    expect(screen.getByText('2 of 25 members')).toBeInTheDocument();
    expect(screen.getByText(/Olive Owner \(you\)/)).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByText('1 client')).toBeInTheDocument();
    expect(screen.getByText('3 clients')).toBeInTheDocument();
    expect(screen.getByText(/names and client counts, not clients/)).toBeInTheDocument();
  });

  it('flags a teammate whose Coach Pass has lapsed', () => {
    setup(inTeam({ members: [member({ user_id: 'me', role: 'owner' }), member({ user_id: 'm1', has_pass: false, client_count: 0 })] }));
    expect(screen.getByText('No clients yet · Coach Pass inactive')).toBeInTheDocument();
  });

  it('the owner can remove a teammate (not themselves), after confirming', async () => {
    const t = setup(inTeam());
    expect(screen.queryByRole('button', { name: 'Remove Olive Owner' })).not.toBeInTheDocument();
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mia Mate' }));
    expect(t.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mia Mate' }));
    expect(t.remove).toHaveBeenCalledWith('m1');
  });

  it('the owner creates invites and can copy or revoke them', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const t = setup(inTeam({ invites: [{ id: 'i1', code: 'ABCD2345', expires_at: future }] }));
    await userEvent.click(screen.getByRole('button', { name: '+ Invite a teammate' }));
    expect(t.invite).toHaveBeenCalled();
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();
    expect(screen.getByText(/Expires in 5 days · single use/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('ABCD2345');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke invite ABCD2345' }));
    expect(t.revokeInvite).toHaveBeenCalledWith('i1');
  });

  it('the owner can remove the team, after confirming', async () => {
    const t = setup(inTeam());
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove team' }));
    expect(t.disband).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove team' }));
    expect(t.disband).toHaveBeenCalledTimes(1);
  });

  it('a plain member sees no invite, remove or delete controls — only Leave', async () => {
    const t = setup(inTeam({ is_owner: false, members: [member({ user_id: 'o1', name: 'Olive Owner', role: 'owner' }), member({ user_id: 'me', name: 'Me' })] }));
    expect(screen.queryByRole('button', { name: '+ Invite a teammate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave team' }));
    expect(t.leave).toHaveBeenCalledTimes(1);
  });

  it('shows the failure when an action is refused', async () => {
    setup(inTeam(), { invite: vi.fn().mockRejectedValue(new Error('You have 10 open invites — revoke some before creating more')) });
    await userEvent.click(screen.getByRole('button', { name: '+ Invite a teammate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('10 open invites');
  });
});
