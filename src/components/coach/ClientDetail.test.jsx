// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('./useClientDashboard', () => ({ useClientDashboard: () => ({ today: '2026-09-20' }) }));
vi.mock('../../lib/db', () => ({ setClientTargets: vi.fn() }));
// The tabs are tested on their own; here they're stand-ins so this file is
// about the shell: which tab shows, keyboard behaviour, and the header.
vi.mock('./OverviewTab', () => ({ default: () => <div>overview-panel</div> }));
vi.mock('./DiaryTab', () => ({ default: () => <div>diary-panel</div> }));
vi.mock('./ProgressTab', () => ({ default: () => <div>progress-panel</div> }));
vi.mock('./MessagesTab', () => ({ default: () => <div>messages-panel</div> }));
vi.mock('./PlanTab', () => ({ default: () => <div>plan-panel</div> }));
vi.mock('./ReportsTab', () => ({ default: () => <div>reports-panel</div> }));

import ClientDetail from './ClientDetail';

afterEach(cleanup);
const client = { id: 'c1', name: 'Sam Client', goal: 'lose' };
const summary = { group_label: 'Cut', calorie_target: 2000, protein_g: 150, today_cal: 1000, last_log_date: '2026-09-20', days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7 };

describe('ClientDetail', () => {
  it('opens on Overview with six labelled tabs', () => {
    render(<ClientDetail client={client} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Overview', 'Diary', 'Progress', 'Messages', 'Plan', 'Reports']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('overview-panel')).toBeInTheDocument();
  });

  it('shows only the selected tab\'s panel', async () => {
    render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByText('reports-panel')).toBeInTheDocument();
    expect(screen.queryByText('overview-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'client-tab-reports');
  });

  it('scrolls the selected tab into view (six tabs overflow on a phone)', async () => {
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    render(<ClientDetail client={client} />);
    scroll.mockClear();
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  it('supports keyboard navigation: arrows wrap, Home/End jump', async () => {
    render(<ClientDetail client={client} />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Diary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Diary' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('only the selected tab is in the tab order (roving tabindex)', () => {
    render(<ClientDetail client={client} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter(t => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs[0].tabIndex).toBe(0);
  });

  it('returns to Overview when a different client is opened', async () => {
    const { rerender } = render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    rerender(<ClientDetail client={{ id: 'c2', name: 'Alex' }} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Alex')).toBeInTheDocument();
  });

  it('keeps the selected tab when the same client is re-supplied as a new object (e.g. after a list refresh)', async () => {
    const { rerender } = render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    rerender(<ClientDetail client={{ ...client, calorie_target: 2100 }} />);
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('messages-panel')).toBeInTheDocument();
  });

  it('shows name, goal, group and the 7-day adherence score', () => {
    render(<ClientDetail client={client} summary={summary} />);
    expect(screen.getByText('Sam Client')).toBeInTheDocument();
    expect(screen.getByText('Lose weight · Cut')).toBeInTheDocument();
    expect(screen.getByText('7-day adherence')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('omits the score, without breaking, when there is no summary', () => {
    render(<ClientDetail client={{ id: 'c3', name: 'New' }} />);
    expect(screen.queryByText('7-day adherence')).not.toBeInTheDocument();
    expect(screen.getByText('No goal set')).toBeInTheDocument();
  });

  // Group-tag/disconnect controls (formerly inline in ClientList's rows,
  // see ClientList.test.jsx) now live in the header here, since opening a
  // client is now via a single tappable row rather than row + inline icons.
  describe('client actions (row/onSetGroup/onRevoke supplied)', () => {
    const linkRow = { id: 'l-c1', group_label: null, client: { id: 'c1', name: 'Sam Client' } };

    beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
    afterEach(() => vi.unstubAllGlobals());

    it('omits the actions when row/onSetGroup/onRevoke are not supplied', () => {
      render(<ClientDetail client={client} />);
      expect(screen.queryByRole('button', { name: 'Disconnect client' })).not.toBeInTheDocument();
    });

    it('asks before disconnecting a client', async () => {
      const onRevoke = vi.fn();
      render(<ClientDetail client={client} row={linkRow} onSetGroup={vi.fn()} onRevoke={onRevoke} />);
      await userEvent.click(screen.getByRole('button', { name: 'Disconnect client' }));
      expect(window.confirm).toHaveBeenCalled();
      expect(onRevoke).not.toHaveBeenCalled();
      window.confirm.mockReturnValue(true);
      await userEvent.click(screen.getByRole('button', { name: 'Disconnect client' }));
      expect(onRevoke).toHaveBeenCalledWith('l-c1');
    });

    it('edits a group label inline', async () => {
      const onSetGroup = vi.fn().mockResolvedValue(undefined);
      render(<ClientDetail client={client} row={linkRow} onSetGroup={onSetGroup} onRevoke={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Set group' }));
      await userEvent.type(screen.getByLabelText('Group name'), 'Cut{Enter}');
      expect(onSetGroup).toHaveBeenCalledWith('l-c1', 'Cut');
    });
  });
});
