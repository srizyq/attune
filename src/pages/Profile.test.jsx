// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false, email: 'alex@example.test' }, signOut: vi.fn() }) }));
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));
vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({ profile: state.profile, save: state.save, refetch: vi.fn() }),
}));
vi.mock('../lib/billing', () => ({ authedPost: vi.fn() }));

import Profile from './Profile';

const BASE_PROFILE = { name: 'Alex', unit: 'metric', age: 30, weight: 70, height: 170, is_premium: false, coach_pass: false, trial_ends_at: null };

const setup = (profileOverrides = {}, saveImpl) => {
  state.profile = { ...BASE_PROFILE, ...profileOverrides };
  state.save = saveImpl || vi.fn(async (fields) => ({ ...state.profile, ...fields }));
  render(<MemoryRouter><Profile /></MemoryRouter>);
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Profile — autosave replaces the Save button', () => {
  it('has no Save button', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
  });

  it('does not save on mount — only on an actual edit', async () => {
    setup();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(state.save).not.toHaveBeenCalled();
  });

  it('autosaves a typed change after the debounce, with the other fields carried through unchanged', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alexandra' } });
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(state.save).toHaveBeenCalledWith({ name: 'Alexandra', unit: 'metric', age: 30, weight: 70, height: 170 });
  });

  it('flushes immediately on blur, without waiting for the debounce', async () => {
    setup();
    const ageInput = screen.getByLabelText('Age');
    fireEvent.change(ageInput, { target: { value: '31' } });
    fireEvent.blur(ageInput);
    await act(async () => { await Promise.resolve(); });
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ age: 31 }));
  });

  it('does not save while a number field is cleared mid-edit — waits for a real value', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(state.save).not.toHaveBeenCalled();
  });

  it('saves again once a cleared field gets a valid value typed back in', async () => {
    setup();
    const ageInput = screen.getByLabelText('Age');
    fireEvent.change(ageInput, { target: { value: '' } });
    fireEvent.change(ageInput, { target: { value: '32' } });
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ age: 32 }));
  });

  it('shows a confirmation after a successful autosave', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alexandra' } });
    // advanceTimersByTimeAsync (not the plain sync version) awaits the
    // promise the debounce's own flushSave() call returns — plain
    // findByText/waitFor polling doesn't mix with fake timers at all.
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    // Toast renders the checkmark and message as separate text nodes
    // ("✓ Saved"), so an exact 'Saved' match misses — substring it instead.
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });

  it('shows an error if the autosave fails, instead of failing silently', async () => {
    setup({}, vi.fn().mockRejectedValue(new Error('network down')));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alexandra' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument();
  });

  it('flushes a pending edit on unmount instead of discarding it', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alexandra' } });
    cleanup(); // unmounts before the 700ms debounce would otherwise fire
    await act(async () => { await Promise.resolve(); });
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alexandra' }));
  });
});

describe('Profile — delete account', () => {
  it('needs DELETE typed before the button works, then calls the server', async () => {
    const { authedPost } = await import('../lib/billing');
    authedPost.mockResolvedValue({ ok: true });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    expect(confirm).not.toBeDisabled();
    await act(async () => { fireEvent.click(confirm); });
    expect(authedPost).toHaveBeenCalledWith('/api/create-portal-session', { action: 'delete-account' });
  });

  it('shows the error and stays signed in when deletion fails', async () => {
    const { authedPost } = await import('../lib/billing');
    authedPost.mockRejectedValue(new Error('Stripe is down'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete forever' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Stripe is down');
  });
});
