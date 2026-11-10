// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueFood, pendingCount, syncQueue, isNetworkError } from './offlineQueue.js';

beforeEach(() => localStorage.clear());

describe('offline queue', () => {
  it('replays in order and empties', async () => {
    enqueueFood('u', { name: 'a' }); enqueueFood('u', { name: 'b' });
    const seen = [];
    const r = await syncQueue(async (_u, e) => { seen.push(e.name); }, 'u');
    expect(seen).toEqual(['a', 'b']);
    expect(r).toEqual({ synced: 2, remaining: 0 });
    expect(pendingCount()).toBe(0);
  });
  it('keeps the rest when the network drops mid-sync', async () => {
    enqueueFood('u', { name: 'a' }); enqueueFood('u', { name: 'b' });
    const r = await syncQueue(async () => { throw new TypeError('Failed to fetch'); }, 'u');
    expect(r.remaining).toBe(2);
  });
  it('drops rejected rows, leaves other users', async () => {
    enqueueFood('u', { name: 'bad' }); enqueueFood('other', { name: 'x' });
    const r = await syncQueue(async () => { throw new Error('violates check constraint'); }, 'u');
    expect(r).toEqual({ synced: 0, remaining: 1 });
  });
  it('classifies errors', () => {
    expect(isNetworkError(new TypeError('x'))).toBe(true);
    expect(isNetworkError(new Error('violates check'))).toBe(false);
  });
});
