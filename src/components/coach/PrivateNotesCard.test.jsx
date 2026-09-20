// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../../hooks/useCoach', () => ({ useTrainerNotes: () => state.notes }));
import PrivateNotesCard from './PrivateNotesCard';

const note = (over = {}) => ({ id: 'n1', body: 'Knee injury', pinned: false, created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z', ...over });
function setup(over = {}) {
  state.notes = { notes: [], supported: true, loading: false, add: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), ...over };
  render(<PrivateNotesCard client={{ id: 'c1' }} clientData={{ name: 'Sam' }} />);
  return state.notes;
}
beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PrivateNotesCard', () => {
  it('tells the coach it is private, by name', () => {
    setup();
    expect(screen.getByText(/Only you can see these — Sam can't\./)).toBeInTheDocument();
  });

  it('adds a trimmed note and clears the box', async () => {
    const n = setup();
    await userEvent.type(screen.getByLabelText('New private note'), '  avoid lunges  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(n.add).toHaveBeenCalledWith('avoid lunges');
    expect(screen.getByLabelText('New private note')).toHaveValue('');
  });

  it('will not save an empty or whitespace-only note', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
  });

  it('keeps what was typed and shows the error if saving fails', async () => {
    const n = setup();
    n.add.mockRejectedValue(new Error('row-level security'));
    await userEvent.type(screen.getByLabelText('New private note'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('row-level security');
    expect(screen.getByLabelText('New private note')).toHaveValue('hello');
  });

  it('lists notes, pins, edits and deletes them', async () => {
    const n = setup({ notes: [note()] });
    expect(screen.getByText('Knee injury')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pin note' }));
    expect(n.update).toHaveBeenCalledWith('n1', { pinned: true });

    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }));
    const box = screen.getByLabelText('Edit note');
    await userEvent.clear(box);
    await userEvent.type(box, 'Knee injury — healed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(n.update).toHaveBeenCalledWith('n1', { body: 'Knee injury — healed' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(n.remove).toHaveBeenCalledWith('n1');
  });

  it('does not delete when the coach cancels the confirmation', async () => {
    window.confirm.mockReturnValue(false);
    const n = setup({ notes: [note()] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(n.remove).not.toHaveBeenCalled();
  });

  it('marks an edited note and an already-pinned one', () => {
    setup({ notes: [note({ pinned: true, updated_at: '2026-09-19T01:00:00Z' })] });
    expect(screen.getByRole('button', { name: 'Unpin note' })).toBeInTheDocument();
    expect(screen.getByText(/edited/)).toBeInTheDocument();
  });

  it('renders note text as text, not HTML', () => {
    setup({ notes: [note({ body: '<img src=x onerror=alert(1)>' })] });
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('explains — rather than breaking — when the notes table does not exist yet', () => {
    setup({ supported: false });
    expect(screen.getByText(/need the latest database update/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New private note')).not.toBeInTheDocument();
  });

  it('shows an empty state', () => {
    setup();
    expect(screen.getByText('No private notes yet.')).toBeInTheDocument();
  });
});
