// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({ addComment: vi.fn(), comments: [] }));
vi.mock('../../hooks/useCoach', () => ({
  useTrainerComments: () => ({ comments: h.comments, addComment: h.addComment, removeComment: vi.fn() }),
  useTrainerNotes: () => ({ notes: [], supported: true, loading: false, add: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));
vi.mock('../../hooks/useVoiceTranscription', () => ({ useVoiceTranscription: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }) }));
import MessagesTab from './MessagesTab';

beforeEach(() => { h.addComment.mockReset().mockResolvedValue(undefined); h.comments = []; });
afterEach(cleanup);
const client = { id: 'c1', name: 'Maya Patel' };
const setup = (props = {}) => render(<MessagesTab client={client} clientData={client} d={{ date: '2026-10-16' }} {...props} />);
const box = () => screen.getByPlaceholderText(/Leave a note for Maya Patel/);

describe('MessagesTab — drafts and quick messages', () => {
  it('starts with a draft from a "Message about this" button, ready to read and change — not sent', () => {
    setup({ initialDraft: 'Hi Maya — I haven\'t seen anything logged.' });
    expect(box()).toHaveValue('Hi Maya — I haven\'t seen anything logged.');
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it('a quick message fills the box with the client\'s name in it, and does not send it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nice work' }));
    expect(box()).toHaveValue('Hi Maya — great work this week. Keep it up!');
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it('a second quick message adds to what is already there instead of wiping it', async () => {
    setup();
    await userEvent.type(box(), 'Also —');
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(box()).toHaveValue('Also — Hi Maya — just checking in — how\'s your week going?');
  });

  it('offers each quick message, scrolling sideways rather than wrapping', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Quick messages' });
    expect(group.querySelectorAll('button')).toHaveLength(4);
    expect(group.style.overflowX).toBe('auto');
  });

  it('sends the edited draft as a general comment on the selected day', async () => {
    setup({ initialDraft: 'Draft text' });
    await userEvent.type(box(), ' plus my edit');
    await userEvent.click(screen.getByRole('button', { name: /Post/ }));
    await waitFor(() => expect(h.addComment).toHaveBeenCalledWith('Draft text plus my edit', '2026-10-16', 'general'));
    expect(box()).toHaveValue('');
  });

  it('marks the thread as viewed once it is open', () => {
    const onViewed = vi.fn();
    setup({ onViewed });
    expect(onViewed).toHaveBeenCalledWith('c1');
  });
});
