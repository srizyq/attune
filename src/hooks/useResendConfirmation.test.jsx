// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const auth = vi.hoisted(() => ({ resend: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth }, emailRedirectTo: 'https://attune.test/dashboard' }));

import { useResendConfirmation } from './useResendConfirmation';

beforeEach(() => { auth.resend.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useResendConfirmation', () => {
  it('has nothing to resend without an email', () => {
    const { result } = renderHook(() => useResendConfirmation(null));
    expect(result.current.canResend).toBe(false);
  });

  it('sends, then stays resendable — not permanently retired — behind a cooldown', async () => {
    auth.resend.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useResendConfirmation('a@b.com'));

    await act(async () => { await result.current.resend(); });
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com', options: { emailRedirectTo: 'https://attune.test/dashboard' } });
    expect(result.current.status).toBe('sent');
    expect(result.current.canResend).toBe(false); // cooling down, not stuck
    expect(result.current.secondsLeft).toBeGreaterThan(0);

    await act(async () => { vi.advanceTimersByTime(result.current.secondsLeft * 1000); });
    expect(result.current.canResend).toBe(true);
    expect(result.current.secondsLeft).toBe(0);

    auth.resend.mockResolvedValue({ error: null });
    await act(async () => { await result.current.resend(); });
    expect(auth.resend).toHaveBeenCalledTimes(2);
  });

  it('reads the real wait out of a rate-limit error instead of guessing', async () => {
    auth.resend.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 47 seconds.' } });
    const { result } = renderHook(() => useResendConfirmation('a@b.com'));

    await act(async () => { await result.current.resend(); });
    expect(result.current.status).toBe('error');
    expect(result.current.secondsLeft).toBe(47);
    expect(result.current.canResend).toBe(false);
  });

  it('ignores a click while already sending or cooling down', async () => {
    let resolveResend;
    auth.resend.mockReturnValue(new Promise((r) => { resolveResend = r; }));
    const { result } = renderHook(() => useResendConfirmation('a@b.com'));

    act(() => { result.current.resend(); });
    expect(result.current.status).toBe('sending');
    act(() => { result.current.resend(); }); // no-op while sending
    expect(auth.resend).toHaveBeenCalledTimes(1);

    await act(async () => { resolveResend({ error: null }); });
  });
});
