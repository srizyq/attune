// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { preloadPages } from './preloadPages.js';

afterEach(() => { vi.useRealTimers(); });

describe('preloadPages', () => {
  it('loads every page, one after another', async () => {
    vi.useFakeTimers();
    const order = [];
    const loaders = ['a', 'b', 'c'].map((n) => () => { order.push(n); return Promise.resolve(); });
    preloadPages(loaders, { saveData: false });
    await vi.runAllTimersAsync();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('carries on past a page that fails to download', async () => {
    vi.useFakeTimers();
    const ok = vi.fn(() => Promise.resolve());
    preloadPages([() => Promise.reject(new Error('offline')), ok], { saveData: false });
    await vi.runAllTimersAsync();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('downloads nothing on data-saver', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    preloadPages([load], { saveData: true });
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
  });

  it('stops when cancelled', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    const stop = preloadPages([load, load], { saveData: false });
    stop();
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
  });
});
