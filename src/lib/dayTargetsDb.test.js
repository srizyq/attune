import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ selects: [], results: [], rpc: null }));
vi.mock('./supabase', () => {
  const chain = (columns) => {
    h.selects.push(columns);
    const q = { eq: () => q, order: () => Promise.resolve(h.results.shift() ?? { data: [], error: null }) };
    return q;
  };
  return { supabase: { from: () => ({ select: chain }), rpc: (...args) => Promise.resolve(h.rpc(...args)) } };
});
import { getMyClients, setClientDayTargets, overrideCoachTargets } from './db';

beforeEach(() => { h.selects.length = 0; h.results.length = 0; h.rpc = () => ({ error: null }); });

describe('getMyClients', () => {
  it('asks for the rest-day columns, and returns what it gets', async () => {
    h.results.push({ data: [{ id: 'l1' }], error: null });
    expect(await getMyClients('t1')).toEqual([{ id: 'l1' }]);
    expect(h.selects).toHaveLength(1);
    expect(h.selects[0]).toContain('rest_day_targets, training_days');
  });

  it('asks for the target-ownership columns too', async () => {
    h.results.push({ data: [{ id: 'l1' }], error: null });
    await getMyClients('t1');
    expect(h.selects[0]).toContain('targets_set_by, targets_set_at, targets_overridden_at');
    expect(h.selects[0]).toContain('pace_kg_per_week');
  });

  it('steps back one update at a time when the database has not been updated, so the client list still loads', async () => {
    // Ownership columns missing → try again without them, still with the rest-day ones.
    h.results.push({ data: null, error: { code: '42703', message: 'column profiles_1.targets_set_by does not exist' } });
    h.results.push({ data: [{ id: 'l1' }], error: null });
    expect(await getMyClients('t1')).toEqual([{ id: 'l1' }]);
    expect(h.selects).toHaveLength(2);
    expect(h.selects[1]).not.toContain('targets_set_by');
    expect(h.selects[1]).toContain('rest_day_targets');
    // Neither update applied → the original columns.
    h.selects.length = 0;
    h.results.push({ data: null, error: { code: '42703', message: 'column profiles_1.targets_set_by does not exist' } });
    h.results.push({ data: null, error: { code: '42703', message: 'column profiles_1.rest_day_targets does not exist' } });
    h.results.push({ data: [{ id: 'l2' }], error: null });
    expect(await getMyClients('t1')).toEqual([{ id: 'l2' }]);
    expect(h.selects).toHaveLength(3);
    expect(h.selects[2]).not.toContain('rest_day_targets');
    expect(h.selects[2]).toContain('micro_targets');
  });

  it('surfaces any other error', async () => {
    const err = { code: '42501', message: 'permission denied' };
    h.results.push({ data: null, error: err });
    await expect(getMyClients('t1')).rejects.toBe(err);
    expect(h.selects).toHaveLength(1);
  });
});

describe('overrideCoachTargets', () => {
  it('calls the database function, and surfaces its error', async () => {
    const calls = [];
    h.rpc = (name) => { calls.push(name); return { error: null }; };
    await overrideCoachTargets();
    expect(calls).toEqual(['override_coach_targets']);
    const err = { code: '42501', message: 'nope' };
    h.rpc = () => ({ error: err });
    await expect(overrideCoachTargets()).rejects.toBe(err);
  });
});

describe('setClientDayTargets', () => {
  it('calls the database function with the right arguments', async () => {
    const calls = [];
    h.rpc = (name, args) => { calls.push([name, args]); return { error: null }; };
    await setClientDayTargets('c1', { calories: 1800 }, [1, 3]);
    expect(calls).toEqual([['set_client_day_targets', { p_client_id: 'c1', p_rest: { calories: 1800 }, p_training_days: [1, 3] }]]);
  });

  it('says plainly that the update is missing when the function does not exist yet', async () => {
    h.rpc = () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.set_client_day_targets' } });
    await expect(setClientDayTargets('c1', null, null)).rejects.toThrow(/latest database update/);
  });

  it('passes other errors through unchanged', async () => {
    h.rpc = () => ({ error: { message: 'Not an active trainer for this client' } });
    await expect(setClientDayTargets('c1', null, null)).rejects.toMatchObject({ message: 'Not an active trainer for this client' });
  });
});
