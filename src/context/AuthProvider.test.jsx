// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth } }));

import { AuthProvider } from './AuthProvider';
import { useAuth } from '../hooks/useAuth';

const pendingSession = { user: { id: 'u1', is_anonymous: true, new_email: 'a@b.com' } };
const confirmedSession = { user: { id: 'u1', is_anonymous: false, email: 'a@b.com' } };

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function setup(session) {
  auth.getSession.mockResolvedValue({ data: { session } });
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

beforeEach(() => {
  auth.getSession.mockReset();
  auth.onAuthStateChange.mockReset();
  auth.getUser.mockReset();
  auth.refreshSession.mockReset();
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  setVisibility('visible');
});
afterEach(cleanup);

describe('checkEmailConfirmed', () => {
  it('reissues the session and reports true once the server shows a confirmed account', async () => {
    auth.getUser.mockResolvedValue({ data: { user: confirmedSession.user } });
    const { result } = setup(pendingSession);
    await act(async () => {});

    let confirmed;
    await act(async () => { confirmed = await result.current.checkEmailConfirmed(); });
    expect(confirmed).toBe(true);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not touch the session when still unconfirmed', async () => {
    auth.getUser.mockResolvedValue({ data: { user: pendingSession.user } });
    const { result } = setup(pendingSession);
    await act(async () => {});

    let confirmed;
    await act(async () => { confirmed = await result.current.checkEmailConfirmed(); });
    expect(confirmed).toBe(false);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('auto re-check on tab focus', () => {
  it('re-checks and refreshes when a pending-confirmation tab regains focus', async () => {
    auth.getUser.mockResolvedValue({ data: { user: confirmedSession.user } });
    const { result } = setup(pendingSession);
    await act(async () => {});
    expect(result.current.user.is_anonymous).toBe(true);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.getUser).toHaveBeenCalled();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an already-confirmed session — no pending state to re-check', async () => {
    setup(confirmedSession);
    await act(async () => {});

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('ignores the event while the tab is hidden', async () => {
    setup(pendingSession);
    await act(async () => {});

    setVisibility('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
