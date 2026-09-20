// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CheckinFormEditor from './CheckinFormEditor';
import { TEMPLATE_QUESTIONS } from '../../lib/checkinForms';

const clientData = { name: 'Sam' };
const setup = (admin = {}) => {
  const a = { supported: true, form: null, loading: false, save: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined), ...admin };
  render(<CheckinFormEditor clientData={clientData} admin={a} />);
  return a;
};
const existing = { id: 'f1', title: 'Weekly check-in', cadence_days: 14, is_active: true, questions: [{ id: 'sleep', type: 'scale', label: 'Sleep?' }, { id: 'wins', type: 'text', label: 'Wins?' }] };

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CheckinFormEditor', () => {
  it('explains the missing database update instead of breaking', () => {
    setup({ supported: false });
    expect(screen.getByText(/need the latest database update/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  });

  it('starts a new form from the standard template, and saves exactly it', async () => {
    const a = setup();
    await userEvent.click(screen.getByRole('button', { name: /standard weekly check-in/ }));
    expect(screen.getAllByLabelText(/^Question \d+$/)).toHaveLength(TEMPLATE_QUESTIONS.length);
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    expect(a.save).toHaveBeenCalledWith({ title: 'Weekly check-in', questions: TEMPLATE_QUESTIONS, cadenceDays: 7, isActive: true });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('loads an existing form, including its schedule', () => {
    setup({ form: existing });
    expect(screen.getByLabelText('Question 1')).toHaveValue('Sleep?');
    expect(screen.getByLabelText('How often')).toHaveValue('14');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('adds, edits, retypes, reorders and removes questions', async () => {
    const a = setup({ form: existing });
    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    await userEvent.type(screen.getByLabelText('Question 3'), 'Any pain?');
    await userEvent.selectOptions(screen.getByLabelText('Question 3 type'), 'yesno');
    await userEvent.click(screen.getByRole('button', { name: 'Move question 3 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove question 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const sent = a.save.mock.calls[0][0];
    expect(sent.questions.map(q => [q.label, q.type])).toEqual([['Any pain?', 'yesno'], ['Wins?', 'text']]);
    expect(new Set(sent.questions.map(q => q.id)).size).toBe(2);
  });

  it('cannot move the first question up or the last down', () => {
    setup({ form: existing });
    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 2 down' })).toBeDisabled();
  });

  it('will not save an empty question, or a form with no questions, and says why', async () => {
    const a = setup({ form: existing });
    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Question 3 needs some text.');
    expect(a.save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove question 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove question 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one question.');
  });

  it('stops at 12 questions', async () => {
    setup({ form: { ...existing, questions: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, type: 'text', label: `Q${i}` })) } });
    expect(screen.getByRole('button', { name: '+ Add question' })).toBeDisabled();
  });

  it('shows the server\'s reason if saving fails, keeping the draft', async () => {
    setup({ form: existing, save: vi.fn().mockRejectedValue(new Error('row-level security')) });
    await userEvent.type(screen.getByLabelText('Question 1'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('row-level security');
    expect(screen.getByLabelText('Question 1')).toHaveValue('Sleep?!');
  });

  it('turns the form off for the client', async () => {
    const a = setup({ form: existing });
    await userEvent.click(screen.getByLabelText(/Send to Sam/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(a.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('removes a form only after confirmation', async () => {
    window.confirm.mockReturnValueOnce(false);
    const a = setup({ form: existing });
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(a.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(a.remove).toHaveBeenCalledWith('f1');
  });
});
