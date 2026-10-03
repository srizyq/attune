import { describe, it, expect, vi } from 'vitest';
import { rateLimit, clientIp, tooManyRequests } from './_rateLimit.js';

describe('rateLimit', () => {
  it('allows when the database says so', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    expect(await rateLimit(supabase, 'k', 5, 60)).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'k', p_max: 5, p_window_seconds: 60 });
  });

  it('blocks when the database says the limit is exceeded', async () => {
    expect(await rateLimit({ rpc: async () => ({ data: false, error: null }) }, 'k', 5)).toBe(false);
  });

  it('fails open if the function is missing (migration not applied yet)', async () => {
    expect(await rateLimit({ rpc: async () => ({ data: null, error: { message: 'function does not exist' } }) }, 'k', 5)).toBe(true);
  });

  it('fails open if the call throws, or the client has no rpc', async () => {
    expect(await rateLimit({ rpc: async () => { throw new Error('network'); } }, 'k', 5)).toBe(true);
    expect(await rateLimit({}, 'k', 5)).toBe(true);
  });
});

describe('clientIp / tooManyRequests', () => {
  it('uses the first x-forwarded-for address', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).toBe('203.0.113.9');
  });

  it('answers 429 with a Retry-After header', () => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
    tooManyRequests(res);
    expect(res.code).toBe(429);
    expect(res.headers['Retry-After']).toBe('60');
  });
});
