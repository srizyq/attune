import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const fails = async (p) => { try { await p; return false; } catch { return true; } };

describe('fasts', () => {
  it('lets someone start, read and end their own fast', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Faster');
    await as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 16)`, [me]);
    const running = await as(db, me, `select target_hours, ended_at from public.fasts where user_id = $1`, [me]);
    expect(running.rows).toHaveLength(1);
    expect(Number(running.rows[0].target_hours)).toBe(16);
    expect(running.rows[0].ended_at).toBeNull();
    await as(db, me, `update public.fasts set ended_at = now() + interval '1 second' where user_id = $1 and ended_at is null`, [me]);
    expect((await as(db, me, `select 1 from public.fasts where user_id = $1 and ended_at is null`, [me])).rows).toHaveLength(0);
  }, 60000);

  it('allows only one running fast per person, but any number of finished ones', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Faster');
    await as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 16)`, [me]);
    expect(await fails(as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 12)`, [me]))).toBe(true);
    await as(db, me, `update public.fasts set ended_at = now() + interval '1 second' where user_id = $1`, [me]);
    await as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 12)`, [me]);
    await as(db, me, `insert into public.fasts (user_id, target_hours, started_at, ended_at) values ($1, 14, now() - interval '2 days', now() - interval '1 day')`, [me]);
  }, 60000);

  it('rejects absurd goals and a fast that ends before it starts', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Faster');
    expect(await fails(as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 0.5)`, [me]))).toBe(true);
    expect(await fails(as(db, me, `insert into public.fasts (user_id, target_hours) values ($1, 100)`, [me]))).toBe(true);
    expect(await fails(as(db, me, `insert into public.fasts (user_id, target_hours, started_at, ended_at) values ($1, 16, now(), now() - interval '1 hour')`, [me]))).toBe(true);
  }, 60000);

  it("keeps one person's fasts invisible and untouchable to another", async () => {
    const db = await createDb();
    const a = await addUser(db, 'Alice');
    const b = await addUser(db, 'Bob');
    await as(db, a, `insert into public.fasts (user_id, target_hours) values ($1, 16)`, [a]);
    expect((await as(db, b, `select * from public.fasts`)).rows).toHaveLength(0);
    expect(await fails(as(db, b, `insert into public.fasts (user_id, target_hours) values ($1, 16)`, [a]))).toBe(true);
    await as(db, b, `update public.fasts set ended_at = now() + interval '1 second'`);
    await as(db, b, `delete from public.fasts`);
    expect((await as(db, a, `select * from public.fasts where ended_at is null`)).rows).toHaveLength(1);
  }, 60000);
});

describe('checkins sleep columns', () => {
  it('stores hours and a quality rating alongside mood and energy', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Sleeper');
    await as(db, me, `insert into public.checkins (user_id, checkin_date, mood, energy, sleep_hours, sleep_quality) values ($1, '2026-10-01', 'good', 8, 7.5, 4)`, [me]);
    const row = (await as(db, me, `select sleep_hours, sleep_quality from public.checkins where user_id = $1`, [me])).rows[0];
    expect(Number(row.sleep_hours)).toBe(7.5);
    expect(row.sleep_quality).toBe(4);
  }, 60000);

  it('rejects impossible sleep values', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Sleeper');
    expect(await fails(as(db, me, `insert into public.checkins (user_id, checkin_date, sleep_hours) values ($1, '2026-10-01', 25)`, [me]))).toBe(true);
    expect(await fails(as(db, me, `insert into public.checkins (user_id, checkin_date, sleep_quality) values ($1, '2026-10-02', 6)`, [me]))).toBe(true);
    expect(await fails(as(db, me, `insert into public.checkins (user_id, checkin_date, sleep_quality) values ($1, '2026-10-03', 0)`, [me]))).toBe(true);
  }, 60000);

  it('the migration clears the energy = 6 that water taps used to write, and nothing else', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Sleeper');
    await db.exec(`insert into public.checkins (user_id, checkin_date, energy) values ('${me}', '2026-10-01', 6)`);                    // artefact
    await db.exec(`insert into public.checkins (user_id, checkin_date, mood, energy) values ('${me}', '2026-10-02', 'good', 6)`);     // chosen with a mood
    await db.exec(`insert into public.checkins (user_id, checkin_date, energy) values ('${me}', '2026-10-03', 9)`);                   // a real, different value
    await db.exec(`update public.checkins set energy = null where energy = 6 and mood is null and note is null`);
    const rows = (await db.query(`select checkin_date::text d, energy from public.checkins order by checkin_date`)).rows;
    expect(rows.map((r) => r.energy)).toEqual([null, 6, 9]);
  }, 60000);

  it('profiles get an off-by-default fast-end notification flag', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Sleeper');
    expect((await db.query(`select notify_fast_end from public.profiles where id = $1`, [me])).rows[0].notify_fast_end).toBe(false);
  }, 60000);
});

describe('profiles.net_carbs', () => {
  it('is off by default and can be switched on and off by its owner', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Keto');
    expect((await db.query(`select net_carbs from public.profiles where id = $1`, [me])).rows[0].net_carbs).toBe(false);
    await as(db, me, `update public.profiles set net_carbs = true where id = $1`, [me]);
    expect((await as(db, me, `select net_carbs from public.profiles where id = $1`, [me])).rows[0].net_carbs).toBe(true);
    await as(db, me, `update public.profiles set net_carbs = false where id = $1`, [me]);
    expect((await as(db, me, `select net_carbs from public.profiles where id = $1`, [me])).rows[0].net_carbs).toBe(false);
  }, 60000);
});
