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

import Profile from './AccountDelete';

const BASE_PROFILE = { name: 'Alex', unit: 'metric', age: 30, weight: 70, height: 170, is_premium: false, coach_pass: false, trial_ends_at: null };

const setup = (profileOverrides = {}, saveImpl) => {
  state.profile = { ...BASE_PROFILE, ...profileOverrides };
  state.save = saveImpl || vi.fn(async (fields) => ({ ...state.profile, ...fields }));
  render(<MemoryRouter><Profile /></MemoryRouter>);
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Delete account page', () => {
  it('needs DELETE typed before the button works, then calls the server', async () => {
    const { authedPost } = await import('../lib/billing');
    authedPost.mockResolvedValue({ ok: true });
    setup();
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
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete forever' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Stripe is down');
  });
});
