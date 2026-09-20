import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const day = (offset) => `(date '2026-09-20' + ${offset})`; // fixed "today" = 2026-09-20

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client, stranger };
}
const food = (db, client, offset, cal, protein = 0) =>
  svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories, protein_g) values ($1, ${day(offset)}, 'lunch', 'x', $2, $3)`, [client, cal, protein]);

describe('trainer_notes are private to the trainer who wrote them', () => {
  it('lets a trainer write and read notes for an active client', async () => {
    const { db, trainer, client } = await setup();
    await as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'Knee injury — no lunges')`, [trainer, client]);
    const rows = (await as(db, trainer, `select body from public.trainer_notes where client_id = $1`, [client])).rows;
    expect(rows).toEqual([{ body: 'Knee injury — no lunges' }]);
  }, 60000);

  it('is invisible to the client, another trainer, and strangers', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'secret')`, [trainer, client]);
    for (const who of [client, other, stranger]) {
      expect((await as(db, who, `select * from public.trainer_notes`)).rows).toHaveLength(0);
    }
  }, 60000);

  it('cannot be written for someone who is not your active client, or as someone else', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await expect(as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'x')`, [trainer, stranger])).rejects.toThrow(/row-level security/);
    await expect(as(db, other, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'x')`, [other, client])).rejects.toThrow(/row-level security/);
    await expect(as(db, other, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'x')`, [trainer, client])).rejects.toThrow(/row-level security/);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    await expect(as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'x')`, [trainer, client])).rejects.toThrow(/row-level security/);
  }, 60000);

  it('stays readable to its author after the client disconnects', async () => {
    const { db, trainer, client } = await setup();
    await as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'keep me')`, [trainer, client]);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect((await as(db, trainer, `select * from public.trainer_notes`)).rows).toHaveLength(1);
  }, 60000);

  it('can be edited and deleted only by the author; the target client cannot be changed; updated_at moves', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    const { rows } = await as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'v1') returning id, updated_at`, [trainer, client]);
    const { id, updated_at } = rows[0];
    await new Promise((r) => setTimeout(r, 20));

    await as(db, other, `update public.trainer_notes set body = 'hijack' where id = $1`, [id]);
    await as(db, other, `delete from public.trainer_notes where id = $1`, [id]);
    await as(db, trainer, `update public.trainer_notes set body = 'v2', client_id = $2 where id = $1`, [id, stranger]);

    const after = (await svc(db, `select * from public.trainer_notes where id = $1`, [id])).rows[0];
    expect(after.body).toBe('v2');
    expect(after.client_id).toBe(client);
    expect(new Date(after.updated_at) > new Date(updated_at)).toBe(true);

    await as(db, trainer, `delete from public.trainer_notes where id = $1`, [id]);
    expect((await svc(db, `select * from public.trainer_notes`)).rows).toHaveLength(0);
  }, 60000);

  it('rejects empty and oversized notes', async () => {
    const { db, trainer, client } = await setup();
    await expect(as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, '')`, [trainer, client])).rejects.toThrow(/check constraint/);
    await expect(as(db, trainer, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, $3)`, [trainer, client, 'x'.repeat(4001)])).rejects.toThrow(/check constraint/);
  }, 60000);
});

describe('workout_logs trainer access', () => {
  it('is granted for active clients only', async () => {
    const { db, trainer, other, client } = await setup();
    await svc(db, `insert into public.workout_logs (user_id, logged_date, type, intensity, duration_minutes, calories_burned) values ($1, current_date, 'Run', 'intense', 30, 300)`, [client]);
    expect((await as(db, trainer, `select * from public.workout_logs where user_id = $1`, [client])).rows).toHaveLength(1);
    expect((await as(db, other, `select * from public.workout_logs where user_id = $1`, [client])).rows).toHaveLength(0);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect((await as(db, trainer, `select * from public.workout_logs where user_id = $1`, [client])).rows).toHaveLength(0);
  }, 60000);

  it('never lets a trainer write a client\'s workouts', async () => {
    const { db, trainer, client } = await setup();
    await expect(as(db, trainer, `insert into public.workout_logs (user_id, logged_date, type, intensity, duration_minutes) values ($1, current_date, 'x', 'light', 1)`, [client])).rejects.toThrow(/row-level security/);
  }, 60000);
});

describe('get_client_summaries', () => {
  it('computes the numbers a trainer scans, relative to the trainer\'s own "today"', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000, protein_g = 150 where id = $1`, [client]);
    await food(db, client, 0, 2000, 150);   // today: on target, protein hit
    await food(db, client, -1, 2200, 100);  // on target (within 15%), protein miss
    await food(db, client, -2, 1000, 140);  // off target, protein hit (>=135)
    await food(db, client, -6, 1800, 150);  // edge of the 7-day window (today-6): counts
    await food(db, client, -7, 2000, 150);  // just outside: does not count
    await svc(db, `insert into public.weight_logs (user_id, logged_date, weight, unit) values ($1, ${day(0)}, 80, 'kg'), ($1, ${day(-10)}, 82, 'kg')`, [client]);
    await svc(db, `insert into public.checkins (user_id, checkin_date, mood) values ($1, ${day(-3)}, 'good')`, [client]);

    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ client_name: 'Sam Client', calorie_target: 2000, protein_g: 150, days_logged_7d: 4, days_on_target_7d: 3, days_protein_7d: 3 });
    expect(Number(r.today_cal)).toBe(2000);
    expect(Number(r.avg_cal_7d)).toBeCloseTo((2000 + 2200 + 1000 + 1800) / 4, 5);
    expect(r.last_log_date.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(Number(r.latest_weight_kg)).toBe(80);
    expect(Number(r.weight_change_kg_14d)).toBe(-2);
    expect(r.last_checkin_date.toISOString().slice(0, 10)).toBe('2026-09-17');
  }, 60000);

  it('returns zeros and nulls (not errors or fake numbers) for a client with no data', async () => {
    const { db, trainer } = await setup();
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0, last_log_date: null, latest_weight_kg: null, weight_change_kg_14d: null, last_checkin_date: null });
    expect(Number(r.today_cal)).toBe(0);
    expect(r.avg_cal_7d).toBeNull();
  }, 60000);

  it('converts pounds to kilograms and ignores a single weigh-in for the change', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `insert into public.weight_logs (user_id, logged_date, weight, unit) values ($1, ${day(0)}, 176.4, 'lb')`, [client]);
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(Number(r.latest_weight_kg)).toBeCloseTo(80.01, 1);
    expect(r.weight_change_kg_14d).toBeNull();
  }, 60000);

  it('does not count on-target days when the client has no target set', async () => {
    const { db, trainer, client } = await setup();
    await food(db, client, 0, 2000, 100);
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ days_logged_7d: 1, days_on_target_7d: 0, days_protein_7d: 0 });
  }, 60000);

  it('only ever returns the calling trainer\'s own active clients', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status) values ($1, $2, 'pending')`, [trainer, stranger]);
    await food(db, client, 0, 500);
    await food(db, stranger, 0, 999);
    expect((await as(db, trainer, `select client_id from public.get_client_summaries('2026-09-20')`)).rows).toEqual([{ client_id: client }]);
    expect((await as(db, other, `select * from public.get_client_summaries('2026-09-20')`)).rows).toHaveLength(0);
    expect((await as(db, client, `select * from public.get_client_summaries('2026-09-20')`)).rows).toHaveLength(0);
  }, 60000);

  it('drops a client the moment they disconnect', async () => {
    const { db, trainer } = await setup();
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect((await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows).toHaveLength(0);
  }, 60000);
});

describe('client_last_log_dates', () => {
  it('works for the service role and is closed to every other role', async () => {
    const { db, client, stranger } = await setup();
    await food(db, client, -3, 100);
    await food(db, client, -1, 100);
    const rows = (await svc(db, `select * from public.client_last_log_dates(array[$1::uuid, $2::uuid])`, [client, stranger])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].last_log_date.toISOString().slice(0, 10)).toBe('2026-09-19');
    await expect(as(db, client, `select * from public.client_last_log_dates(array[$1::uuid])`, [stranger])).rejects.toThrow(/permission denied/);
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly on a database that already has it', async () => {
    const db = await createDb();
    const block = sliceMigration('Coach tools: private notes');
    expect(block).toContain('get_client_summaries');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
