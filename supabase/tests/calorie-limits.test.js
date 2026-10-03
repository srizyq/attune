import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const period = (over = {}) => ({ id: 'a', start: '2026-10-01', end: '2026-10-14', calories: 1800, created_at: '2026-10-01T00:00:00Z', ...over });
const valid = async (db, value) => (await db.query(`select public.valid_calorie_limit_periods($1::jsonb) v`, [JSON.stringify(value)])).rows[0].v;

describe('valid_calorie_limit_periods', () => {
  it('accepts an empty list and well-formed, non-overlapping periods', async () => {
    const db = await createDb();
    expect(await valid(db, [])).toBe(true);
    expect(await valid(db, [period()])).toBe(true);
    expect(await valid(db, [period(), period({ id: 'b', start: '2026-10-15', end: '2026-10-20' })])).toBe(true);
  }, 60000);

  it('rejects the wrong shape', async () => {
    const db = await createDb();
    expect(await valid(db, {})).toBe(false);
    expect(await valid(db, 'x')).toBe(false);
    expect(await valid(db, [1])).toBe(false);
    expect(await valid(db, [period({ calories: 'many' })])).toBe(false);
    expect(await valid(db, [{ id: 'a', start: '2026-10-01', calories: 1800 }])).toBe(false);
    expect((await db.query(`select public.valid_calorie_limit_periods(null) v`)).rows[0].v).toBe(false);
  }, 60000);

  it('rejects out-of-range calories, backwards dates, absurd lengths and unparseable dates', async () => {
    const db = await createDb();
    expect(await valid(db, [period({ calories: 100 })])).toBe(false);
    expect(await valid(db, [period({ calories: 99999 })])).toBe(false);
    expect(await valid(db, [period({ start: '2026-10-14', end: '2026-10-01' })])).toBe(false);
    expect(await valid(db, [period({ start: '2026-01-01', end: '2028-01-01' })])).toBe(false);
    expect(await valid(db, [period({ start: 'next week', end: 'later' })])).toBe(false);
    expect(await valid(db, [period({ start: '2026-02-31', end: '2026-03-02' })])).toBe(false);
  }, 60000);

  it('rejects overlapping periods, including touching on a shared day', async () => {
    const db = await createDb();
    expect(await valid(db, [period(), period({ id: 'b', start: '2026-10-10', end: '2026-10-20' })])).toBe(false);
    expect(await valid(db, [period(), period({ id: 'b', start: '2026-10-14', end: '2026-10-20' })])).toBe(false);
    expect(await valid(db, [period({ id: 'b', start: '2026-10-05', end: '2026-10-06' }), period()])).toBe(false);
  }, 60000);

  it('rejects more than 60 entries', async () => {
    const db = await createDb();
    const many = Array.from({ length: 61 }, (_, i) => period({ id: `p${i}`, start: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`, end: `2025-${String((i % 12) + 1).padStart(2, '0')}-02` }));
    expect(await valid(db, many)).toBe(false);
  }, 60000);
});

describe('profiles.calorie_limit_periods', () => {
  it('defaults to an empty list for existing and new profiles', async () => {
    const db = await createDb();
    const u = await addUser(db, 'Sam');
    const row = (await db.query(`select calorie_limit_periods from public.profiles where id = $1`, [u])).rows[0];
    expect(row.calorie_limit_periods).toEqual([]);
  }, 60000);

  it('a member can store their own periods, and the constraint blocks bad data', async () => {
    const db = await createDb();
    const u = await addUser(db, 'Sam');
    await as(db, u, `update public.profiles set calorie_limit_periods = $1::jsonb where id = $2`, [JSON.stringify([period()]), u]);
    const stored = (await db.query(`select calorie_limit_periods from public.profiles where id = $1`, [u])).rows[0].calorie_limit_periods;
    expect(stored).toEqual([period()]);
    await expect(as(db, u, `update public.profiles set calorie_limit_periods = $1::jsonb where id = $2`, [JSON.stringify([period({ calories: 5 })]), u])).rejects.toThrow();
    await expect(as(db, u, `update public.profiles set calorie_limit_periods = null where id = $1`, [u])).rejects.toThrow();
  }, 60000);

  it('one member cannot change another member\'s periods', async () => {
    const db = await createDb();
    const a = await addUser(db, 'A');
    const b = await addUser(db, 'B');
    await as(db, a, `update public.profiles set calorie_limit_periods = $1::jsonb where id = $2`, [JSON.stringify([period()]), b]);
    const stored = (await db.query(`select calorie_limit_periods from public.profiles where id = $1`, [b])).rows[0].calorie_limit_periods;
    expect(stored).toEqual([]);
  }, 60000);
});
