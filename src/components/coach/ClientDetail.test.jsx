// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('./useClientDashboard', () => ({ useClientDashboard: () => ({ today: '2026-09-20' }) }));
vi.mock('../../lib/db', () => ({ setClientTargets: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'coach-1' } }) }));
// The tabs are tested on their own; here they're stand-ins so this file is
// about the shell: which tab shows, keyboard behaviour, the header, the sheet.
vi.mock('./SnapshotTab', () => ({ default: ({ onMessage }) => <div>snapshot-panel<button onClick={() => onMessage('drafted text')}>draft-message</button></div> }));
vi.mock('./DiaryTab', () => ({ default: () => <div>diary-panel</div> }));
vi.mock('./ProgressTab', () => ({ default: ({ reportsOpen }) => <div>progress-panel{reportsOpen ? ' reports-open' : ''}</div> }));
vi.mock('./PlanTab', () => ({ default: () => <div>plan-panel</div> }));
vi.mock('./MessagesSheet', () => ({ default: ({ draft, onClose, onViewed }) => <div role="dialog" aria-label="messages-sheet">sheet draft=[{draft}]<button onClick={onClose}>close-sheet</button><button onClick={() => onViewed('c1')}>viewed</button></div> }));

import ClientDetail from './ClientDetail';

afterEach(cleanup);
const client = { id: 'c1', name: 'Sam Client', goal: 'lose' };
const summary = { group_label: 'Cut', calorie_target: 2000, protein_g: 150, today_cal: 1000, last_log_date: '2026-09-20', days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7 };
const linkRow = { id: 'l-c1', group_label: null, client: { id: 'c1', name: 'Sam Client' } };

describe('ClientDetail — the page', () => {
  it('opens on Snapshot with four labelled tabs that all fit', () => {
    render(<ClientDetail client={client} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Snapshot', 'Diary', 'Progress', 'Plan']);
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/snapshot-panel/)).toBeInTheDocument();
  });

  it('shows only the selected tab\'s panel', async () => {
    render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(screen.getByText('plan-panel')).toBeInTheDocument();
    expect(screen.queryByText(/snapshot-panel/)).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'client-tab-plan');
  });

  it('supports keyboard navigation: arrows wrap, Home/End jump', async () => {
    render(<ClientDetail client={client} />);
    screen.getByRole('tab', { name: 'Snapshot' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Diary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Diary' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
  });

  it('only the selected tab is in the tab order (roving tabindex)', () => {
    render(<ClientDetail client={client} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter(t => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs[0].tabIndex).toBe(0);
  });

  it('returns to Snapshot when a different client is opened, but keeps the tab for a refreshed copy of the same one', async () => {
    const { rerender } = render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    rerender(<ClientDetail client={{ ...client, calorie_target: 2100 }} />);
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    rerender(<ClientDetail client={{ id: 'c2', name: 'Alex' }} />);
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument();
  });

  it('understands the ids older links used: Overview is Snapshot, Reports opens inside Progress', () => {
    render(<ClientDetail client={client} initialTab="overview" />);
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
    cleanup();
    render(<ClientDetail client={client} initialTab="reports" />);
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/reports-open/)).toBeInTheDocument();
  });
});

describe('ClientDetail — the slim header', () => {
  it('is one row: back, name, goal and group, and the 7-day score', () => {
    render(<ClientDetail client={client} summary={summary} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Sam Client' })).toBeInTheDocument();
    expect(screen.getByText('Lose weight · Cut')).toBeInTheDocument();
    expect(screen.getByLabelText('7-day adherence 100 percent')).toHaveTextContent('100%');
    expect(screen.getByRole('button', { name: 'All clients' })).toBeInTheDocument();
  });

  it('the back button goes back, and is named for where it goes', async () => {
    const onBack = vi.fn();
    render(<ClientDetail client={client} onBack={onBack} backLabel="All team clients" />);
    await userEvent.click(screen.getByRole('button', { name: 'All team clients' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('omits the score, without breaking, when there is no summary', () => {
    render(<ClientDetail client={{ id: 'c3', name: 'New' }} />);
    expect(screen.queryByLabelText(/7-day adherence/)).not.toBeInTheDocument();
    expect(screen.getByText('No goal set')).toBeInTheDocument();
  });
});

describe('ClientDetail — Messages is a button that opens a sheet', () => {
  it('opens the sheet from the header on any tab, and closes it again', async () => {
    render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Diary' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(screen.getByRole('dialog', { name: 'messages-sheet' })).toBeInTheDocument();
    expect(screen.getByText('diary-panel')).toBeInTheDocument(); // still on the tab underneath
    await userEvent.click(screen.getByText('close-sheet'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows how many messages are new, as a dot and in the button\'s name', () => {
    render(<ClientDetail client={client} unreadCount={2} />);
    expect(screen.getByRole('button', { name: 'Messages, 2 new' })).toBeInTheDocument();
    expect(screen.getByTestId('messages-unread-dot')).toBeInTheDocument();
    cleanup();
    render(<ClientDetail client={client} unreadCount={0} />);
    expect(screen.queryByTestId('messages-unread-dot')).toBeNull();
  });

  it('opens straight to the sheet when sent there (from the inbox), staying on Snapshot underneath', () => {
    render(<ClientDetail client={client} initialTab="messages" />);
    expect(screen.getByRole('dialog', { name: 'messages-sheet' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a "Message about this" draft from the Snapshot lands in the sheet', async () => {
    render(<ClientDetail client={client} />);
    await userEvent.click(screen.getByText('draft-message'));
    expect(screen.getByRole('dialog')).toHaveTextContent('draft=[drafted text]');
  });

  it('tells the page the messages were viewed', async () => {
    const onMessagesViewed = vi.fn();
    render(<ClientDetail client={client} initialTab="messages" onMessagesViewed={onMessagesViewed} />);
    await userEvent.click(screen.getByText('viewed'));
    expect(onMessagesViewed).toHaveBeenCalledWith('c1');
  });
});

describe('ClientDetail — read-only (a team owner viewing a teammate\'s client)', () => {
  it('has no Plan tab and no Messages button, and says it is view only', () => {
    render(<ClientDetail client={client} readOnly coachName="Mia Mate" />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Snapshot', 'Diary', 'Progress']);
    expect(screen.queryByRole('button', { name: /Messages/ })).toBeNull();
    expect(screen.getByText(/View only · Coach: Mia Mate/)).toBeInTheDocument();
  });

  it('never opens the sheet, even if sent to Messages', () => {
    render(<ClientDetail client={client} readOnly initialTab="messages" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ClientDetail — actions live in the ⋯ menu', () => {
  beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
  afterEach(() => vi.unstubAllGlobals());

  it('has no loose Disconnect or group buttons on the page, only the menu', () => {
    render(<ClientDetail client={client} row={linkRow} onSetGroup={vi.fn()} onRevoke={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Disconnect client' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set group' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('asks before disconnecting a client', async () => {
    const onRevoke = vi.fn();
    render(<ClientDetail client={client} row={linkRow} onSetGroup={vi.fn()} onRevoke={onRevoke} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disconnect client' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onRevoke).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disconnect client' }));
    expect(onRevoke).toHaveBeenCalledWith('l-c1');
  });

  it('sets a group label', async () => {
    const onSetGroup = vi.fn().mockResolvedValue(undefined);
    render(<ClientDetail client={client} row={linkRow} onSetGroup={onSetGroup} onRevoke={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Set group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cut{Enter}');
    expect(onSetGroup).toHaveBeenCalledWith('l-c1', 'Cut');
  });

  it('"Export a report" goes to Progress with the report builder open', async () => {
    render(<ClientDetail client={client} row={linkRow} onSetGroup={vi.fn()} onRevoke={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export a report' }));
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/reports-open/)).toBeInTheDocument();
  });
});
