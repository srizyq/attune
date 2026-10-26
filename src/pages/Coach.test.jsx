// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: state.profile }) }));
vi.mock('../hooks/useCoach', () => ({
  useMyClients: () => ({ clients: state.clients, loading: false, revoke: vi.fn(), setGroup: vi.fn(), refetch: vi.fn() }),
  useClientSummaries: () => ({ summaries: [], supported: true, loading: false, refetch: vi.fn() }),
  useTeamClients: () => ({ clients: state.teamClients || [], summaries: [], loading: false, supported: true, refetch: vi.fn() }),
  useMyTrainers: () => ({ pending: state.pendingCoach || [], active: [] }),
  useClientMessages: (opts) => { state.messagesOpts = opts; return { unread: state.unread, total: [...state.unread.values()].reduce((n, v) => n + v.unread, 0), markSeen: state.markSeen }; },
}));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => ({ team: state.team ?? null }) }));
vi.mock('../components/AppNav', () => ({ default: () => null }));
vi.mock('../components/LogoMark', () => ({ default: () => null }));
vi.mock('../components/friends/FriendsTabs', () => ({ default: () => null }));
vi.mock('../components/ClientCoachHub', () => ({ default: () => <div>client-hub</div> }));
vi.mock('../components/coach/TeamCard', () => ({ default: () => <div>team-card</div> }));
vi.mock('../components/CoachInvitePanel', () => ({ default: () => <div data-testid="invite-panel">invite-panel</div> }));
vi.mock('../components/coach/ClientList', () => ({
  default: ({ onSelect, onMessage, clients, title }) => (
    <div data-testid="client-list" data-title={title}>
      {clients.map((r) => (
        <span key={r.id}>
          <button onClick={() => onSelect(r.client)}>open {r.client.name}</button>
          {onMessage && <button onClick={() => onMessage(r.client)}>message {r.client.name}</button>}
        </span>
      ))}
    </div>
  ),
}));
vi.mock('../components/coach/ClientDetail', () => ({
  default: ({ client, initialTab, onMessagesViewed, readOnly, onBack, backLabel, unreadCount }) => (
    <div>
      <span data-testid="detail">{client.name} on {initialTab}{readOnly ? ' (read only)' : ''}{unreadCount ? ` unread=${unreadCount}` : ''}</span>
      <button onClick={onBack}>{backLabel || 'All clients'}</button>
      {onMessagesViewed && <button onClick={() => onMessagesViewed(client.id)}>view messages</button>}
    </div>
  ),
}));

import Coach from './Coach';

const maya = { id: 'l1', client: { id: 'a', name: 'Maya Patel' } };
const setup = (over = {}) => {
  state.profile = { coach_pass: true, name: 'Sam' };
  state.clients = [maya];
  state.unread = new Map();
  state.markSeen = vi.fn();
  Object.assign(state, over);
  render(<MemoryRouter><Coach /></MemoryRouter>);
};
const order = () => screen.getAllByTestId(/^(client-list|invite-panel)$/).map((e) => e.dataset.testid);
beforeEach(() => { delete state.messagesOpts; delete state.team; delete state.teamClients; delete state.pendingCoach; });
afterEach(cleanup);

describe('Coach page', () => {
  it('puts the client list first, with inviting folded away behind a row once there are clients', async () => {
    setup();
    expect(screen.getByTestId('client-list')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-panel')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Invite a client/, expanded: false }));
    expect(order()).toEqual(['client-list', 'invite-panel']);
  });

  it('puts inviting first, open, when there are no clients yet', () => {
    setup({ clients: [] });
    expect(order()).toEqual(['invite-panel', 'client-list']);
    expect(screen.queryByRole('button', { name: /Invite a client/ })).toBeNull(); // nothing to fold away
  });

  it('has a "+" (Add a client) in the header that opens the invite section', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Add a client' }));
    expect(screen.getByTestId('invite-panel')).toBeInTheDocument();
  });

  it('has no "+" before there is a client to add to', () => {
    setup({ clients: [] });
    expect(screen.queryByRole('button', { name: 'Add a client' })).toBeNull();
  });

  it('has no My clients | My coach switch for a coach with no team — most coaches have no coach of their own', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'My coach' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My clients' })).toBeNull();
  });

  it('reaches your own coach from a link at the bottom, and comes back', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Your own coach/ }));
    expect(screen.getByText('client-hub')).toBeInTheDocument();
    expect(screen.queryByTestId('client-list')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /My clients/ }));
    expect(screen.getByTestId('client-list')).toBeInTheDocument();
  });

  it('says when your own coach is waiting for an answer, so an invite is never buried', () => {
    setup({ pendingCoach: [{ id: 'p1' }] });
    expect(screen.getByRole('button', { name: /Your own coach.*1 waiting/ })).toBeInTheDocument();
  });

  it('shows who has written, and tapping them opens their messages (not the Snapshot)', async () => {
    setup({ unread: new Map([['a', { unread: 2, latestAt: new Date().toISOString(), latestBody: 'Can we swap dinner?' }]]) });
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText(/Can we swap dinner\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('2 new messages'));
    expect(screen.getByTestId('detail')).toHaveTextContent('Maya Patel on messages');
  });

  it('opening a client from the list starts on the Snapshot, and viewing messages marks them seen', async () => {
    setup();
    await userEvent.click(screen.getByText('open Maya Patel'));
    expect(screen.getByTestId('detail')).toHaveTextContent('Maya Patel on snapshot');
    await userEvent.click(screen.getByText('view messages'));
    expect(state.markSeen).toHaveBeenCalledWith('a');
  });

  it('a client page replaces the page header (it draws its own), and Back returns to the list', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Coach' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('open Maya Patel'));
    expect(screen.queryByRole('heading', { name: 'Coach' })).toBeNull();
    expect(screen.queryByTestId('client-list')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All clients' }));
    expect(screen.getByTestId('client-list')).toBeInTheDocument();
  });

  it('the message button on a card opens that client straight to their messages', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'message Maya Patel' }));
    expect(screen.getByTestId('detail')).toHaveTextContent('Maya Patel on messages');
  });

  it('tells the client page how many of their messages are new', async () => {
    setup({ unread: new Map([['a', { unread: 2, latestAt: new Date().toISOString(), latestBody: 'hi' }]]) });
    await userEvent.click(screen.getByText('open Maya Patel'));
    expect(screen.getByTestId('detail')).toHaveTextContent('unread=2');
  });

  it('only a coach polls for client messages', () => {
    setup({ profile: { coach_pass: false, name: 'Sam' } });
    expect(state.messagesOpts).toEqual({ enabled: false });
    cleanup();
    setup();
    expect(state.messagesOpts).toEqual({ enabled: true });
  });

  it('mentions new messages in the header', () => {
    setup({ unread: new Map([['a', { unread: 3, latestAt: new Date().toISOString(), latestBody: 'hi' }]]) });
    expect(screen.getByText(/3 new messages/, { selector: 'div,p,span' })).toBeInTheDocument();
  });

  describe('team owner', () => {
    const team = (isOwner, n = 2) => ({ is_owner: isOwner, members: Array.from({ length: n }, (_, i) => ({ user_id: `m${i}` })) });
    const kai = { id: 'tl1', client: { id: 'kai', name: 'Kai Teamclient' } };

    it('an owner of a team with other coaches gets a Team clients tab that lists teammates\' clients, read-only', async () => {
      setup({ team: team(true), teamClients: [kai] });
      await userEvent.click(screen.getByRole('button', { name: 'Team clients' }));
      expect(screen.getByTestId('client-list')).toHaveAttribute('data-title', 'Team clients');
      await userEvent.click(screen.getByRole('button', { name: 'open Kai Teamclient' }));
      expect(screen.getByTestId('detail')).toHaveTextContent(/Kai Teamclient on.*\(read only\)/);
      await userEvent.click(screen.getByRole('button', { name: /All team clients/ }));
      expect(screen.getByTestId('client-list')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'My clients' })).toBeInTheDocument(); // the switch is only here, for owners
    });

    it('has no such tab for a member, for an owner alone on the team, or with no team', () => {
      for (const t of [team(false), team(true, 1), null]) {
        cleanup();
        setup({ team: t });
        expect(screen.queryByRole('button', { name: 'Team clients' })).toBeNull();
      }
    });
  });
});
