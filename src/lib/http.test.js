import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from './http';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('fetchWithTimeout', () => {
  it('passes the request through and returns the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchWithTimeout('/api/x', { method: 'POST', body: '{}' });
    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', expect.objectContaining({ method: 'POST', body: '{}', signal: expect.any(AbortSignal) }));
  });

  it('gives up with a friendly error when the request hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const pending = fetchWithTimeout('/api/x', { timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('does not rewrite ordinary network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWithTimeout('/api/x')).rejects.toThrow('Failed to fetch');
  });

  it('honours a caller-supplied abort signal', async () => {
    vi.stubGlobal('fetch', vi.fn((_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const caller = new AbortController();
    const pending = fetchWithTimeout('/api/x', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});
