// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
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
vi.mock('./MessagesTab', () => ({ default: ({ initialDraft, onViewed }) => <div>messages-page draft=[{initialDraft}]<button onClick={() => onViewed('c1')}>viewed</button></div> }));

import ClientDetail from './ClientDetail';

afterEach(cleanup);
const client = { id: 'c1', name: 'Sam Client', goal: 'lose' };
const summary = { group_label: 'Cut', calorie_target: 2000, protein_g: 150, today_cal: 1000, last_log_date: '2026-09-20', days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7 };
const linkRow = { id: 'l-c1', group_label: null, client: { id: 'c1', name: 'Sam Client' } };

// The page keeps its section in the URL; this stands in for that.
function Harness({ initial = 'snapshot', ...props }) {
  const [section, setSection] = useState(initial);
  return <ClientDetail client={client} section={section} onSection={setSection} {...props} />;
}

describe('ClientDetail — the page', () => {
  it('opens on Snapshot with a row for each of Diary, Progress, Plan, Messages and Private notes — no tabs', () => {
    render(<Harness />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(within(screen.getByRole('navigation', { name: 'Client sections' })).getAllByRole('button').map(b => b.textContent)).toEqual([
      expect.stringMatching(/^Diary/), expect.stringMatching(/^Progress/), expect.stringMatching(/^Plan/), expect.stringMatching(/^Messages/), expect.stringMatching(/^Private notes/),
    ]);
    expect(screen.getByText(/snapshot-panel/)).toBeInTheDocument();
  });

  it('each row opens its own page, with a back button to the client', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Plan/ }));
    expect(screen.getByText('plan-panel')).toBeInTheDocument();
    expect(screen.queryByText(/snapshot-panel/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to Sam Client' }));
    expect(screen.getByText(/snapshot-panel/)).toBeInTheDocument();
  });

  it('shows the page for the section it is given', () => {
    render(<Harness initial="diary" />);
    expect(screen.getByText('diary-panel')).toBeInTheDocument();
    cleanup();
    render(<Harness initial="progress" />);
    expect(screen.getByText('progress-panel')).toBeInTheDocument();
  });

  it('falls back to the client\'s home for a section it does not know', () => {
    render(<Harness initial="nonsense" />);
    expect(screen.getByText(/snapshot-panel/)).toBeInTheDocument();
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

describe('ClientDetail — Messages is a page', () => {
  it('opens from the header button on any page, and goes back to the client', async () => {
    render(<Harness initial="diary" />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Sam Client' }));
    await userEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(screen.getByText(/messages-page/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Messages' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to Sam Client' }));
    expect(screen.queryByText(/messages-page/)).toBeNull();
  });

  it('shows how many messages are new, as a dot and in the button\'s name', () => {
    render(<Harness unreadCount={2} />);
    expect(screen.getByRole('button', { name: 'Messages, 2 new' })).toBeInTheDocument();
    expect(screen.getByTestId('messages-unread-dot')).toBeInTheDocument();
    cleanup();
    render(<Harness unreadCount={0} />);
    expect(screen.queryByTestId('messages-unread-dot')).toBeNull();
  });

  it('opens straight to the messages page when sent there (from the inbox)', () => {
    render(<Harness initial="messages" />);
    expect(screen.getByText(/messages-page/)).toBeInTheDocument();
  });

  it('a "Message about this" draft from the Snapshot lands on the messages page', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('draft-message'));
    expect(screen.getByText(/messages-page/)).toHaveTextContent('draft=[drafted text]');
  });

  it('tells the page the messages were viewed', async () => {
    const onMessagesViewed = vi.fn();
    render(<Harness initial="messages" onMessagesViewed={onMessagesViewed} />);
    await userEvent.click(screen.getByText('viewed'));
    expect(onMessagesViewed).toHaveBeenCalledWith('c1');
  });
});

describe('ClientDetail — read-only (a team owner viewing a teammate\'s client)', () => {
  it('has no Plan or Messages pages, and says it is view only', () => {
    render(<Harness readOnly coachName="Mia Mate" />);
    expect(within(screen.getByRole('navigation', { name: 'Client sections' })).getAllByRole('button').map(b => b.textContent)).toEqual([
      expect.stringMatching(/^Diary/), expect.stringMatching(/^Progress/),
    ]);
    expect(screen.queryByRole('button', { name: /Messages/ })).toBeNull();
    expect(screen.getByText(/View only · Coach: Mia Mate/)).toBeInTheDocument();
  });

  it('never opens messages, even if sent there', () => {
    render(<Harness readOnly initial="messages" />);
    expect(screen.queryByText(/messages-page/)).toBeNull();
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
    render(<Harness row={linkRow} onSetGroup={vi.fn()} onRevoke={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export a report' }));
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText(/reports-open/)).toBeInTheDocument();
  });
});
