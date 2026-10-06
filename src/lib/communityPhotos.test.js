// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fitWithin } from './photoMath.js';

const invoke = vi.fn();
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, storage: {} } }));
const { recheckPending, forgetRetries } = await import('./communityPhotos.js');

describe('fitWithin', () => {
  it('shrinks the longer edge to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1080)).toEqual({ width: 1080, height: 810 });
    expect(fitWithin(3000, 4000, 1080)).toEqual({ width: 810, height: 1080 });
  });
  it('never scales a small photo up, and never returns zero', () => {
    expect(fitWithin(600, 400, 1080)).toEqual({ width: 600, height: 400 });
    expect(fitWithin(10000, 1, 1080)).toEqual({ width: 1080, height: 1 });
  });
});

describe('recheckPending', () => {
  beforeEach(() => { invoke.mockReset(); forgetRetries(); });

  it('asks the checker again and returns a decision', async () => {
    invoke.mockResolvedValue({ data: { status: 'approved' }, error: null });
    expect(await recheckPending({ kind: 'post', postId: 'p1', path: 'u/p1.jpg' })).toBe('approved');
    expect(invoke).toHaveBeenCalledWith('screen-photo', { body: { kind: 'post', post_id: 'p1' } });
  });

  it('only tries once per photo, so a failing checker cannot loop', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('down') });
    expect(await recheckPending({ kind: 'post', postId: 'p1', path: 'u/p1.jpg' })).toBeNull(); // still pending
    expect(await recheckPending({ kind: 'post', postId: 'p1', path: 'u/p1.jpg' })).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValue({ data: { status: 'rejected' }, error: null });
    expect(await recheckPending({ kind: 'post', postId: 'p2', path: 'u/p2.jpg' })).toBe('rejected'); // another photo is its own try
  });

  it('does nothing without a photo', async () => {
    expect(await recheckPending({ kind: 'avatar', path: null })).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
