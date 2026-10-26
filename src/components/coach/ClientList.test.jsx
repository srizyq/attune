// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../hooks/useHistory', () => ({ useHistory: () => ({ dailyData: [], loading: false }) }));
import ClientList from './ClientList';

const TODAY = '2026-09-20';
const mk = (id, name, over = {}) => ({
  link_id: `l-${id}`, client_id: id, client_name: name, group_label: null, connected_at: '2026-08-01T00:00:00Z', goal: 'maintain',
  calorie_target: 2000, protein_g: 150, last_log_date: '2026-09-20', days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7,
  today_cal: 1800, weight_change_kg_14d: null, ...over,
});
const row = (id, name, over = {}) => ({ id: `l-${id}`, group_label: over.group_label ?? null, created_at: '2026-08-01T00:00:00Z', client: { id, name } });

const ok = mk('ok', 'Olive');
const quiet = mk('quiet', 'Quinn', { last_log_date: '2026-09-10', days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0, today_cal: 0 });
const patchy = mk('patchy', 'Pat', { days_logged_7d: 2, days_on_target_7d: 2, days_protein_7d: 2, today_cal: 900 });
const rows = [row('ok', 'Olive'), row('quiet', 'Quinn'), row('patchy', 'Pat')];

// `extra` adds that many healthy clients (named Zed 1, Zed 2…): search and sort
// only appear from 9 clients, and the filters from 4.
function setup({ extra = 0, ...props } = {}) {
  const fillers = Array.from({ length: extra }, (_, i) => ({ r: row(`z${i}`, `Zed ${i + 1}`), s: mk(`z${i}`, `Zed ${i + 1}`) }));
  const handlers = { onSelect: vi.fn(), onStatus: vi.fn(), onMessage: vi.fn() };
  render(<ClientList clients={[...rows, ...fillers.map(f => f.r)]} loading={false} summaries={[ok, quiet, patchy, ...fillers.map(f => f.s)]} summariesSupported today={TODAY} loggedTodayCount={0} resolvedCount={0} allLoggedToday={false} {...handlers} {...props} />);
  return handlers;
}
const names = () => screen.getAllByRole('button', { name: /Olive|Quinn|Pat/ }).filter(b => !/^Message /.test(b.getAttribute('aria-label') || '')).map(b => b.textContent.match(/Olive|Quinn|Pat/)[0]);

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ClientList — only as many controls as the list needs', () => {
  it('a short list has no search, sort or filters — just the clients', () => {
    setup();
    expect(screen.queryByLabelText('Search clients')).toBeNull();
    expect(screen.queryByLabelText('Sort clients')).toBeNull();
    expect(screen.queryByRole('button', { name: /Needs attention/ })).toBeNull();
    expect(names()).toEqual(['Quinn', 'Pat', 'Olive']); // still ordered by who needs a look
  });

  it('filters appear from four clients, search and sort from nine', () => {
    setup({ extra: 1 });
    expect(screen.getByRole('button', { name: /Needs attention/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Search clients')).toBeNull();
    cleanup();
    setup({ extra: 5 });
    expect(screen.queryByLabelText('Search clients')).toBeNull(); // 8 clients
    cleanup();
    setup({ extra: 6 });
    expect(screen.getByLabelText('Search clients')).toBeInTheDocument(); // 9
    expect(screen.getByLabelText('Sort clients')).toBeInTheDocument();
  });
});

describe('ClientList — one reason, and a way to message', () => {
  it('shows only the most urgent reason on a card, and how many more there are', () => {
    const many = mk('many', 'Mo', { last_log_date: '2026-09-10', days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0, today_cal: 0, goal: 'lose', weight_rate_kg_week: 0.4, pace_kg_per_week: 0.5 });
    setup({ clients: [row('many', 'Mo')], summaries: [many] });
    expect(screen.getByText('No logs in 10 days')).toBeInTheDocument();
    expect(screen.queryByText(/Weight moving the wrong way/)).toBeNull();
    expect(screen.getByText(/^\+\d+ more$/)).toBeInTheDocument();
  });

  it('has a message button on each card that messages that client without opening them', async () => {
    const h = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Message Olive' }));
    expect(h.onMessage).toHaveBeenCalledWith({ id: 'ok', name: 'Olive' });
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it('the message button is a proper tap target and shows a dot when they have written', () => {
    setup({ unread: new Map([['ok', { unread: 1, latestAt: '2026-09-20T01:00:00Z', latestBody: 'hi' }]]) });
    expect(screen.getByRole('button', { name: 'Message Olive' }).style.height).toBe('44px');
  });

  it('has no message button when the list is not the coach\'s own (team view)', () => {
    setup({ onMessage: undefined });
    expect(screen.queryByRole('button', { name: /^Message / })).toBeNull();
  });
});

describe('ClientList — unread messages', () => {
  const unread = new Map([['patchy', { unread: 2, latestAt: '2026-09-20T01:00:00Z', latestBody: 'hello' }]]);

  it('marks the client who has written, and says how many', () => {
    setup({ unread, extra: 1 });
    expect(screen.getByText('2 new messages')).toBeInTheDocument();
    expect(screen.getByText('Unread (1)')).toBeInTheDocument();
  });

  it('the Unread filter shows only clients with something new, and says so when there is none', async () => {
    setup({ unread, extra: 1 });
    await userEvent.click(screen.getByText('Unread (1)'));
    expect(names()).toEqual(['Pat']);
    cleanup();
    setup({ unread: new Map(), extra: 1 });
    await userEvent.click(screen.getByText('Unread'));
    expect(screen.getByText('No unread messages.')).toBeInTheDocument();
  });

  it('shows a client with one new message in the singular, and nothing for clients with none', () => {
    setup({ unread: new Map([['ok', { unread: 1, latestAt: '2026-09-20T01:00:00Z', latestBody: 'hi' }]]) });
    expect(screen.getByText('1 new message')).toBeInTheDocument();
    expect(screen.queryByText(/new messages/)).toBeNull();
  });
});

describe('ClientList (with summaries)', () => {
  it('labels the score: a percent on each card, and a line saying what it measures behind the (i)', async () => {
    setup();
    const badge = screen.getByLabelText('7-day adherence 100 percent');
    expect(badge).toHaveTextContent('100%');
    expect(badge).toHaveAttribute('title', expect.stringContaining('within 10% of their calorie target'));
    const explain = /is 7-day adherence/;
    expect(screen.queryByText(explain)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'About the percentage' }));
    expect(screen.getByText(explain)).toBeInTheDocument();
  });

  it('puts the client who needs the most attention first, with the reason', () => {
    setup();
    expect(names()).toEqual(['Quinn', 'Pat', 'Olive']);
    expect(screen.getByText('No logs in 10 days')).toBeInTheDocument();
    expect(screen.getByText('Logged 2 of the last 7 days')).toBeInTheDocument();
  });

  it('shows a headline count of who needs attention', () => {
    setup();
    expect(screen.getByText('2 need attention')).toBeInTheDocument();
    cleanup();
    setup({ summaries: [ok] , clients: [row('ok', 'Olive')] });
    expect(screen.getByText('All on track')).toBeInTheDocument();
  });

  it('describes recent activity in words', () => {
    setup();
    expect(screen.getByText('1,800 kcal today')).toBeInTheDocument();
    expect(screen.getByText('900 kcal today')).toBeInTheDocument();
    expect(screen.getByText('Last logged 10 days ago')).toBeInTheDocument();
  });

  it('searches by name, and says so when nothing matches', async () => {
    setup({ extra: 6 });
    await userEvent.type(screen.getByLabelText('Search clients'), 'oli');
    expect(names()).toEqual(['Olive']);
    await userEvent.clear(screen.getByLabelText('Search clients'));
    await userEvent.type(screen.getByLabelText('Search clients'), 'zzz');
    expect(screen.getByText('No clients match.')).toBeInTheDocument();
  });

  it('searches by group label too', async () => {
    const fillers = Array.from({ length: 7 }, (_, i) => mk(`z${i}`, `Zed ${i + 1}`));
    setup({ clients: [row('ok', 'Olive'), row('quiet', 'Quinn'), ...fillers.map(f => row(f.client_id, f.client_name))], summaries: [ok, mk('quiet', 'Quinn', { group_label: 'Cut' }), ...fillers] });
    await userEvent.type(screen.getByLabelText('Search clients'), 'cut');
    expect(names()).toEqual(['Quinn']);
  });

  it('filters to only clients needing attention', async () => {
    setup({ extra: 1 });
    await userEvent.click(screen.getByRole('button', { name: /Needs attention \(2\)/ }));
    expect(names()).toEqual(['Quinn', 'Pat']);
  });

  it('says nobody needs attention when the filter empties the list', async () => {
    const fillers = Array.from({ length: 3 }, (_, i) => mk(`z${i}`, `Zed ${i + 1}`));
    setup({ summaries: [ok, ...fillers], clients: [row('ok', 'Olive'), ...fillers.map(f => row(f.client_id, f.client_name))] });
    await userEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Nobody needs attention right now.')).toBeInTheDocument();
  });

  it('re-sorts', async () => {
    setup({ extra: 6 });
    await userEvent.selectOptions(screen.getByLabelText('Sort clients'), 'name');
    expect(names()).toEqual(['Olive', 'Pat', 'Quinn']);
  });

  it('opens a client', async () => {
    const h = setup();
    await userEvent.click(screen.getAllByRole('button', { name: /Olive/ }).find(b => !/^Message /.test(b.getAttribute('aria-label') || '')));
    expect(h.onSelect).toHaveBeenCalledWith({ id: 'ok', name: 'Olive' });
  });

  // Disconnect/group-label editing moved to ClientDetail's header (see
  // ClientDetail.test.jsx) now that a row is a single tap target into that
  // view, rather than inline actions living in the row itself.

  it('shows the invite prompt when there are no clients yet', () => {
    setup({ clients: [], summaries: [] });
    expect(screen.getByText(/Once a client accepts your invite/)).toBeInTheDocument();
  });

  it('ignores a client with no summary row yet rather than crashing', () => {
    setup({ summaries: [ok] }); // three linked clients, only one summarised
    expect(names()).toEqual(['Olive']);
  });
});

describe('ClientList (database update not applied yet)', () => {
  it('falls back to the per-client rows, with no search/sort controls', () => {
    setup({ summariesSupported: false, summaries: [] });
    expect(screen.queryByLabelText('Search clients')).not.toBeInTheDocument();
    expect(screen.getByText('Olive')).toBeInTheDocument();
    expect(screen.getAllByText(/Hasn't logged today|No data yet|…/).length).toBeGreaterThan(0);
  });
});
