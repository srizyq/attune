import { describe, it, expect, vi } from 'vitest';
import { selectAll } from './paging.js';

// A fake query builder over an in-memory table that honours .range() and
// returns a fresh builder per call, like supabase-js.
function tableOf(n) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls = [];
  const build = () => ({
    range: async (from, to) => { calls.push([from, to]); return { data: all.slice(from, to + 1), error: null }; },
  });
  return { build, calls, all };
}

describe('selectAll', () => {
  it('returns everything past the 1,000-row server cap, in order, with no gaps or repeats', async () => {
    const { build, calls, all } = tableOf(2350);
    const rows = await selectAll(build);
    expect(rows).toHaveLength(2350);
    expect(rows).toEqual(all);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('makes one request when everything fits, and none extra on an exact page boundary', async () => {
    const small = tableOf(3);
    expect(await selectAll(small.build)).toHaveLength(3);
    expect(small.calls).toHaveLength(1);

    const exact = tableOf(2000); // last page is full, so one more (empty) request confirms the end
    expect(await selectAll(exact.build)).toHaveLength(2000);
    expect(exact.calls).toHaveLength(3);
  });

  it('handles an empty table', async () => {
    expect(await selectAll(tableOf(0).build)).toEqual([]);
  });

  it('throws on a failed page instead of returning a partial result', async () => {
    let n = 0;
    const build = () => ({
      range: async () => (++n === 2 ? { data: null, error: new Error('boom') } : { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }),
    });
    await expect(selectAll(build)).rejects.toThrow('boom');
  });

  it('uses a fresh builder for every page (supabase-js builders are single-use)', async () => {
    const build = vi.fn(() => ({ range: async () => ({ data: [], error: null }) }));
    await selectAll(build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('honours a custom page size', async () => {
    const { build, calls } = tableOf(5);
    expect(await selectAll(build, 2)).toHaveLength(5);
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
});
