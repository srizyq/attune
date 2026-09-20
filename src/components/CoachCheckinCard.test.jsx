// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useCheckinForms', () => ({ useMyCheckinForms: () => state.hook }));
import CoachCheckinCard from './CoachCheckinCard';

const Q = [{ id: 'sleep', type: 'scale', label: 'Sleep?' }, { id: 'hungry', type: 'yesno', label: 'Hungry?' }, { id: 'wins', type: 'text', label: 'Wins?' }];
const form = (over = {}) => ({ id: 'f1', title: 'Weekly check-in', questions: Q, cadence_days: 7, is_active: true, created_at: '2026-08-01T00:00:00Z', last_response_at: null, trainer: { name: 'Jordan Lee' }, ...over });
const setup = (forms, over = {}) => {
  state.hook = { supported: true, forms, submit: vi.fn().mockResolvedValue(undefined), ...over };
  render(<CoachCheckinCard />);
  return state.hook;
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-20T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CoachCheckinCard', () => {
  it('renders nothing with no forms, or before the database update', () => {
    setup([]);
    expect(document.body).not.toHaveTextContent('Weekly check-in');
    cleanup();
    setup([form()], { supported: false });
    expect(document.body).not.toHaveTextContent('Weekly check-in');
  });

  it('shows a due check-in as a form, with each question type', () => {
    setup([form()]);
    expect(screen.getByText('Jordan Lee would like an update.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^([1-9]|10)$/ })).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Wins?')).toBeInTheDocument();
  });

  it('will not send until every scale and yes/no question is answered, and says which is missing', async () => {
    const h = setup([form()]);
    await userEvent.click(screen.getByRole('button', { name: 'Send to coach' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sleep?');
    expect(h.submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to coach' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hungry?');
  });

  it('sends typed answers (text optional) and thanks the client', async () => {
    const h = setup([form()]);
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    await userEvent.type(screen.getByLabelText('Wins?'), 'Great week');
    await userEvent.click(screen.getByRole('button', { name: 'Send to coach' }));
    expect(h.submit).toHaveBeenCalledWith('f1', { sleep: 7, hungry: false, wins: 'Great week' });
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to Jordan Lee');
  });

  it('marks the chosen answer and lets it change', async () => {
    setup([form()]);
    await userEvent.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '9' }));
    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the answers and shows the reason when sending fails', async () => {
    setup([form()], { submit: vi.fn().mockRejectedValue(new Error('You\'ve already submitted this check-in recently')) });
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to coach' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already submitted');
    expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows when the next one is due, instead of the form, right after answering', () => {
    setup([form({ last_response_at: '2026-09-18T12:00:00Z' })]);
    expect(screen.queryByRole('button', { name: 'Send to coach' })).not.toBeInTheDocument();
    expect(screen.getByText(/Submitted .*\. Your next one from Jordan Lee is due /)).toBeInTheDocument();
  });

  it('opens again once the schedule says it is due', () => {
    setup([form({ last_response_at: '2026-09-10T12:00:00Z' })]);
    expect(screen.getByRole('button', { name: 'Send to coach' })).toBeInTheDocument();
  });
});
