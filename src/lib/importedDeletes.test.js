import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real queries behind undo — what the database is actually asked to delete.
const h = vi.hoisted(() => ({ calls: [], result: { data: [], error: null } }));
vi.mock('./supabase', () => ({
  supabase: {
    from: (table) => {
      const call = { table, filters: [] };
      h.calls.push(call);
      const c = {
        delete: () => { call.op = 'delete'; return c; },
        insert: (rows) => { call.op = 'insert'; call.payload = rows; return c; },
        upsert: (rows, opts) => { call.op = 'upsert'; call.payload = rows; call.opts = opts; return c; },
        eq: (k, v) => { call.filters.push(['eq', k, v]); return c; },
        gte: (k, v) => { call.filters.push(['gte', k, v]); return c; },
        lte: (k, v) => { call.filters.push(['lte', k, v]); return c; },
        in: (k, v) => { call.filters.push(['in', k, v]); return c; },
        select: (cols) => { call.select = cols; return Promise.resolve(h.result); },
      };
      return c;
    },
  },
}));
import { insertFoodLogRows, insertWeightLogRows, deleteImportedFood, deleteImportedWeights } from './db';

beforeEach(() => { h.calls.length = 0; h.result = { data: [], error: null }; });

describe('what an import records for undo', () => {
  it('asks for the server timestamps of the food rows it adds', async () => {
    h.result = { data: [{ created_at: 't1' }], error: null };
    expect(await insertFoodLogRows([{ food_name: 'x' }])).toEqual([{ created_at: 't1' }]);
    expect(h.calls[0]).toMatchObject({ table: 'food_logs', op: 'insert', select: 'created_at' });
  });
  it('adds weigh-ins without touching dates that already have one, and returns only the new ones', async () => {
    h.result = { data: [{ logged_date: '2026-03-01', created_at: 't' }], error: null };
    expect(await insertWeightLogRows([{ logged_date: '2026-03-01' }, { logged_date: '2026-03-02' }])).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ table: 'weight_logs', op: 'upsert', opts: { onConflict: 'user_id,logged_date', ignoreDuplicates: true } });
  });
  it('does nothing for no rows', async () => {
    expect(await insertFoodLogRows([])).toEqual([]);
    expect(await insertWeightLogRows([])).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });
});

describe('deleteImportedFood', () => {
  it('only deletes this user\'s imported rows inside the window', async () => {
    h.result = { data: [{ id: 1 }, { id: 2 }], error: null };
    expect(await deleteImportedFood('u1', 'A', 'B')).toBe(2);
    expect(h.calls[0]).toMatchObject({ table: 'food_logs', op: 'delete' });
    expect(h.calls[0].filters).toEqual([['eq', 'user_id', 'u1'], ['eq', 'source', 'import'], ['gte', 'created_at', 'A'], ['lte', 'created_at', 'B']]);
  });
  it('surfaces an error instead of reporting success', async () => {
    h.result = { data: null, error: new Error('rls') };
    await expect(deleteImportedFood('u1', 'A', 'B')).rejects.toThrow('rls');
  });
});

describe('deleteImportedWeights', () => {
  it('limits to the import\'s own dates and window', async () => {
    h.result = { data: [{ id: 1 }], error: null };
    expect(await deleteImportedWeights('u1', ['2026-03-01'], 'A', 'B')).toBe(1);
    expect(h.calls[0].filters).toEqual([['eq', 'user_id', 'u1'], ['in', 'logged_date', ['2026-03-01']], ['gte', 'created_at', 'A'], ['lte', 'created_at', 'B']]);
  });
  it('batches long date lists so the request stays a sensible size, and adds the counts up', async () => {
    const dates = Array.from({ length: 400 }, (_, i) => `d${i}`);
    h.result = { data: [{ id: 1 }, { id: 2 }], error: null };
    expect(await deleteImportedWeights('u1', dates, 'A', 'B')).toBe(6);
    expect(h.calls.map((c) => c.filters.find((f) => f[0] === 'in')[2].length)).toEqual([150, 150, 100]);
  });
  it('does nothing for no dates', async () => {
    expect(await deleteImportedWeights('u1', [], 'A', 'B')).toBe(0);
    expect(h.calls).toHaveLength(0);
  });
});
