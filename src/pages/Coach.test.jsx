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
  useClientMessages: (opts) => { state.messagesOpts = opts; return { unread: state.unread, total: [...state.unread.values()].reduce((n, v) => n + v.unread, 0), markSeen: state.markSeen }; },
}));
vi.mock('../components/AppNav', () => ({ default: () => null }));
vi.mock('../components/LogoMark', () => ({ default: () => null }));
vi.mock('../components/friends/FriendsTabs', () => ({ default: () => null }));
vi.mock('../components/ClientCoachHub', () => ({ default: () => <div>client-hub</div> }));
vi.mock('../components/coach/TeamCard', () => ({ default: () => <div>team-card</div> }));
vi.mock('../components/CoachInvitePanel', () => ({ default: () => <div data-testid="invite-panel">invite-panel</div> }));
vi.mock('../components/coach/ClientList', () => ({
  default: ({ onSelect, clients }) => <div data-testid="client-list">{clients.map((r) => <button key={r.id} onClick={() => onSelect(r.client)}>open {r.client.name}</button>)}</div>,
}));
vi.mock('../components/coach/ClientDetail', () => ({
  default: ({ client, initialTab, onMessagesViewed }) => (
    <div>
      <span data-testid="detail">{client.name} on {initialTab}</span>
      <button onClick={() => onMessagesViewed(client.id)}>view messages</button>
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
beforeEach(() => { delete state.messagesOpts; });
afterEach(cleanup);

describe('Coach page', () => {
  it('puts the client list before the invite card once there are clients (first thing on a phone)', () => {
    setup();
    expect(order()).toEqual(['client-list', 'invite-panel']);
  });

  it('puts inviting first when there are no clients yet', () => {
    setup({ clients: [] });
    expect(order()).toEqual(['invite-panel', 'client-list']);
  });

  it('shows who has written, and tapping them opens their messages (not Overview)', async () => {
    setup({ unread: new Map([['a', { unread: 2, latestAt: new Date().toISOString(), latestBody: 'Can we swap dinner?' }]]) });
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText(/Can we swap dinner\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('2 new messages'));
    expect(screen.getByTestId('detail')).toHaveTextContent('Maya Patel on messages');
  });

  it('opening a client from the list still starts on Overview, and viewing messages marks them seen', async () => {
    setup();
    await userEvent.click(screen.getByText('open Maya Patel'));
    expect(screen.getByTestId('detail')).toHaveTextContent('Maya Patel on overview');
    await userEvent.click(screen.getByText('view messages'));
    expect(state.markSeen).toHaveBeenCalledWith('a');
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
});
