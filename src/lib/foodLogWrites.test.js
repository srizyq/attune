import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ calls: [], results: [] }));
vi.mock('./supabase', () => {
  const chain = (kind, payload) => {
    h.calls.push({ kind, payload });
    const result = () => h.results.shift() ?? { data: { id: 'row1' }, error: null };
    const c = { eq: () => c, select: () => c, single: () => Promise.resolve(result()) };
    return c;
  };
  return { supabase: { from: () => ({ insert: (p) => chain('insert', p), update: (p) => chain('update', p) }) } };
});
import { addFoodLog, updateFoodLog } from './db';

const entry = { loggedDate: '2026-09-21', meal: 'lunch', name: 'Salmon', cal: 200, protein: 20, carbs: 0, fat: 12 };
const missing = { code: 'PGRST204', message: "Could not find the 'thiamin_mg' column of 'food_logs' in the schema cache" };
beforeEach(() => { h.calls.length = 0; h.results.length = 0; });

describe('addFoodLog', () => {
  it('sends no extended columns for a food that has none — so an un-updated database is never touched by them', async () => {
    await addFoodLog('u1', { ...entry, thiamin: null });
    expect(h.calls).toHaveLength(1);
    expect(Object.keys(h.calls[0].payload).filter((k) => /thiamin|caffeine|selenium|omega|alcohol|iodine/.test(k))).toEqual([]);
  });

  it('sends the extended columns when the food carries them', async () => {
    await addFoodLog('u1', { ...entry, thiamin: 0.25, caffeine: 0 });
    expect(h.calls[0].payload).toMatchObject({ thiamin_mg: 0.25, caffeine_mg: 0, food_name: 'Salmon' });
  });

  it('retries without them when the database has not been updated yet, so logging still works', async () => {
    h.results.push({ data: null, error: missing });
    const row = await addFoodLog('u1', { ...entry, thiamin: 0.25 });
    expect(row).toEqual({ id: 'row1' });
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].payload.thiamin_mg).toBe(0.25);
    expect('thiamin_mg' in h.calls[1].payload).toBe(false);
    expect(h.calls[1].payload.food_name).toBe('Salmon');
  });

  it('does not retry (or hide) a different error', async () => {
    h.results.push({ data: null, error: { code: '42501', message: 'row-level security' } });
    await expect(addFoodLog('u1', { ...entry, thiamin: 0.25 })).rejects.toMatchObject({ code: '42501' });
    expect(h.calls).toHaveLength(1);
  });

  it('does not retry when there was nothing extra to drop', async () => {
    h.results.push({ data: null, error: missing });
    await expect(addFoodLog('u1', entry)).rejects.toBe(missing);
    expect(h.calls).toHaveLength(1);
  });
});

describe('updateFoodLog', () => {
  it('leaves unknown extended nutrients alone rather than overwriting them with zero', async () => {
    await updateFoodLog('id1', { ...entry, thiamin: null, caffeine: 40 });
    expect('thiamin_mg' in h.calls[0].payload).toBe(false);
    expect(h.calls[0].payload.caffeine_mg).toBe(40);
  });

  it('retries without the extended columns on a database that has not been updated', async () => {
    h.results.push({ data: null, error: missing });
    await updateFoodLog('id1', { ...entry, thiamin: 0.3 });
    expect(h.calls).toHaveLength(2);
    expect('thiamin_mg' in h.calls[1].payload).toBe(false);
    expect(h.calls[1].payload.calories).toBe(200);
  });
});
