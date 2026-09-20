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

function setup(props = {}) {
  const handlers = { onSelect: vi.fn(), onRevoke: vi.fn(), onSetGroup: vi.fn().mockResolvedValue(undefined), onStatus: vi.fn() };
  render(<ClientList clients={rows} loading={false} summaries={[ok, quiet, patchy]} summariesSupported today={TODAY} loggedTodayCount={0} resolvedCount={0} allLoggedToday={false} {...handlers} {...props} />);
  return handlers;
}
const names = () => screen.getAllByRole('button', { name: /Olive|Quinn|Pat/ }).map(b => b.textContent.match(/Olive|Quinn|Pat/)[0]);

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ClientList (with summaries)', () => {
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
    setup();
    await userEvent.type(screen.getByLabelText('Search clients'), 'oli');
    expect(names()).toEqual(['Olive']);
    await userEvent.clear(screen.getByLabelText('Search clients'));
    await userEvent.type(screen.getByLabelText('Search clients'), 'zzz');
    expect(screen.getByText('No clients match.')).toBeInTheDocument();
  });

  it('searches by group label too', async () => {
    setup({ summaries: [ok, mk('quiet', 'Quinn', { group_label: 'Cut' })] });
    await userEvent.type(screen.getByLabelText('Search clients'), 'cut');
    expect(names()).toEqual(['Quinn']);
  });

  it('filters to only clients needing attention', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Needs attention \(2\)/ }));
    expect(names()).toEqual(['Quinn', 'Pat']);
  });

  it('says nobody needs attention when the filter empties the list', async () => {
    setup({ summaries: [ok], clients: [row('ok', 'Olive')] });
    await userEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Nobody needs attention right now.')).toBeInTheDocument();
  });

  it('re-sorts', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Sort clients'), 'name');
    expect(names()).toEqual(['Olive', 'Pat', 'Quinn']);
  });

  it('opens a client', async () => {
    const h = setup();
    await userEvent.click(screen.getByRole('button', { name: /Olive/ }));
    expect(h.onSelect).toHaveBeenCalledWith({ id: 'ok', name: 'Olive' });
  });

  it('asks before disconnecting a client', async () => {
    const h = setup({ summaries: [ok], clients: [row('ok', 'Olive')] });
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect client' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(h.onRevoke).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect client' }));
    expect(h.onRevoke).toHaveBeenCalledWith('l-ok');
  });

  it('edits a group label inline', async () => {
    const h = setup({ summaries: [ok], clients: [row('ok', 'Olive')] });
    await userEvent.click(screen.getByRole('button', { name: 'Set group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cut{Enter}');
    expect(h.onSetGroup).toHaveBeenCalledWith('l-ok', 'Cut');
  });

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
