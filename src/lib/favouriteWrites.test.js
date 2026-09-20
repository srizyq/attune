import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [], results: [] }));
vi.mock('./supabase', () => {
  const upsert = (payload) => {
    h.calls.push(payload);
    const c = { select: () => c, single: () => Promise.resolve(h.results.shift() ?? { data: { id: 'fav1' }, error: null }) };
    return c;
  };
  return { supabase: { from: () => ({ upsert }) } };
});
import { addFavouriteFood } from './db';

const missing = { code: 'PGRST204', message: "Could not find the 'vitamin_a_mcg' column of 'favourite_foods' in the schema cache" };
const food = { name: 'Salmon', meta: '1 serving', cal: 300, protein: 30, calcium: 20, vitaminA: 30, thiamin: 0.25 };
beforeEach(() => { h.calls.length = 0; h.results.length = 0; });

describe('addFavouriteFood on a database that has not had the update', () => {
  it('retries without the newer columns so starring still works, and still saves everything else', async () => {
    h.results.push({ data: null, error: missing });
    expect(await addFavouriteFood('u1', food)).toEqual({ id: 'fav1' });
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0]).toMatchObject({ vitamin_a_mcg: 30, thiamin_mg: 0.25 });
    expect('vitamin_a_mcg' in h.calls[1]).toBe(false);
    expect('thiamin_mg' in h.calls[1]).toBe(false);
    expect(h.calls[1]).toMatchObject({ name: 'Salmon', calories: 300, calcium_mg: 20, user_id: 'u1' });
  });

  it('does not retry (or hide) a different error', async () => {
    h.results.push({ data: null, error: { code: '42501', message: 'row-level security' } });
    await expect(addFavouriteFood('u1', food)).rejects.toMatchObject({ code: '42501' });
    expect(h.calls).toHaveLength(1);
  });

  it('does not retry when there was nothing newer to drop', async () => {
    h.results.push({ data: null, error: missing });
    await expect(addFavouriteFood('u1', { name: 'Toast', cal: 80 })).rejects.toBe(missing);
    expect(h.calls).toHaveLength(1);
  });
});
