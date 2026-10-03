// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => ({ insert: (...a) => insert(...a) }),
  },
}));

import { reportError, shouldReport, _resetReporting } from './reportError';

beforeEach(() => { insert.mockReset().mockResolvedValue({ error: null }); _resetReporting(); });

describe('reportError', () => {
  it('records the message, route and user', async () => {
    await reportError(new Error('kaboom'));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ message: 'kaboom', user_id: 'u1' }));
  });

  it('reports the same error only once', async () => {
    await reportError(new Error('same'));
    await reportError(new Error('same'));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('stops after five reports in a session', async () => {
    for (let i = 0; i < 9; i++) await reportError(new Error(`e${i}`));
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it('ignores browser noise', () => {
    expect(shouldReport('ResizeObserver loop completed with undelivered notifications.')).toBe(false);
    expect(shouldReport('Script error.')).toBe(false);
    expect(shouldReport('Cannot read properties of undefined')).toBe(true);
  });

  it('never throws, even if the table is missing', async () => {
    insert.mockRejectedValue(new Error('relation "client_errors" does not exist'));
    await expect(reportError(new Error('x'))).resolves.toBeUndefined();
  });
});
