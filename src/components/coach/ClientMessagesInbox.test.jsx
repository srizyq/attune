// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import ClientMessagesInbox from './ClientMessagesInbox';

afterEach(cleanup);
const clients = [{ id: 'l1', client: { id: 'a', name: 'Maya Patel' } }, { id: 'l2', client: { id: 'b', name: 'Jordan Lee' } }];
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

describe('ClientMessagesInbox', () => {
  it('lists who wrote, newest first, with a preview and how many are new', () => {
    const unread = new Map([['a', { unread: 2, latestAt: iso(5), latestBody: 'Is it ok to swap dinner?' }], ['b', { unread: 1, latestAt: iso(1), latestBody: 'Weighed in today' }]]);
    render(<ClientMessagesInbox unread={unread} clients={clients} onOpen={() => {}} />);
    expect(screen.getByTestId('inbox-total')).toHaveTextContent('3 new');
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows[0]).toContain('Jordan Lee');
    expect(rows[1]).toContain('Maya Patel');
    expect(screen.getByText(/Is it ok to swap dinner\?/)).toBeInTheDocument();
    expect(screen.getByLabelText('2 new messages')).toBeInTheDocument();
    expect(screen.getByLabelText('1 new message')).toBeInTheDocument();
  });

  it('opens the client that was tapped', async () => {
    const onOpen = vi.fn();
    render(<ClientMessagesInbox unread={new Map([['a', { unread: 1, latestAt: iso(1), latestBody: 'hi' }]])} clients={clients} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith({ id: 'a', name: 'Maya Patel' });
  });

  it('shortens a long message', () => {
    render(<ClientMessagesInbox unread={new Map([['a', { unread: 1, latestAt: iso(1), latestBody: 'x'.repeat(200) }]])} clients={clients} onOpen={() => {}} />);
    expect(screen.getByText(/x{90}…/)).toBeInTheDocument();
  });

  it('renders nothing when nothing is new, or when the writer is no longer a client', () => {
    expect(render(<ClientMessagesInbox unread={new Map()} clients={clients} onOpen={() => {}} />).container).toBeEmptyDOMElement();
    cleanup();
    expect(render(<ClientMessagesInbox unread={new Map([['gone', { unread: 1, latestAt: iso(1), latestBody: 'hi' }]])} clients={clients} onOpen={() => {}} />).container).toBeEmptyDOMElement();
  });
});
