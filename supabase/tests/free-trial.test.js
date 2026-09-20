import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, asUser, asService, readSchema } from './harness.js';
import { TRIAL_DAYS } from '../../src/lib/trial.js';

// The first createDb() builds the whole schema (slow); warm it once.
beforeAll(() => createDb(), 60000);

// The stub auth.users only has id/email; start_free_trial also reads
// created_at and new_email, which real Supabase always has.
const AUTH_COLUMNS = `alter table auth.users add column if not exists created_at timestamptz not null default now(), add column if not exists new_email text`;

async function setup({ email = 'new@example.test', newEmail = null, createdAt = null } = {}) {
  const db = await createDb({ extraSql: [AUTH_COLUMNS] });
  const { rows } = await db.query(
    `insert into auth.users (email, new_email, created_at) values ($1, $2, coalesce($3::timestamptz, now())) returning id`,
    [email, newEmail, createdAt]
  );
  const id = rows[0].id;
  // Step4 creates the profile row on page load, BEFORE the trial is started.
  await db.query(`insert into public.profiles (id, name) values ($1, 'New User')`, [id]);
  return { db, id };
}
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const trialOf = async (db, id) => (await db.query(`select trial_ends_at from public.profiles where id = $1`, [id])).rows[0].trial_ends_at;
const daysFromNow = (d) => (new Date(d).getTime() - Date.now()) / 86400000;

describe('the signup flow starts the free trial', () => {
  it('a client-side write of trial_ends_at is reverted (why the RPC exists)', async () => {
    const { db, id } = await setup();
    await as(db, id, `update public.profiles set trial_ends_at = now() + interval '30 days' where id = $1`, [id]);
    expect(await trialOf(db, id)).toBeNull();
  });

  it('start_free_trial() gives a profile that already exists a 30-day trial', async () => {
    const { db, id } = await setup();
    const { rows } = await as(db, id, `select public.start_free_trial() as ends`);
    expect(daysFromNow(rows[0].ends)).toBeGreaterThan(29.9);
    expect(daysFromNow(rows[0].ends)).toBeLessThan(30.1);
    expect(daysFromNow(await trialOf(db, id))).toBeGreaterThan(29.9);
  });

  it('works while the email is still unconfirmed (new_email only)', async () => {
    const { db, id } = await setup({ email: null, newEmail: 'pending@example.test' });
    const { rows } = await as(db, id, `select public.start_free_trial() as ends`);
    expect(rows[0].ends).not.toBeNull();
  });

  it('is idempotent: calling again never extends or resets the trial', async () => {
    const { db, id } = await setup();
    const first = (await as(db, id, `select public.start_free_trial() as ends`)).rows[0].ends;
    await asService(db, (q) => q(`update public.profiles set trial_ends_at = trial_ends_at - interval '10 days' where id = $1`, [id]));
    const before = await trialOf(db, id);
    const again = (await as(db, id, `select public.start_free_trial() as ends`)).rows[0].ends;
    expect(new Date(again).getTime()).toBe(new Date(before).getTime());
    expect(new Date(again).getTime()).toBeLessThan(new Date(first).getTime());
  });

  it('does nothing for a guest who has not attached an email', async () => {
    const { db, id } = await setup({ email: null });
    const { rows } = await as(db, id, `select public.start_free_trial() as ends`);
    expect(rows[0].ends).toBeNull();
    expect(await trialOf(db, id)).toBeNull();
  });

  it('does nothing for an account that predates the trial (new signups only)', async () => {
    const { db, id } = await setup({ createdAt: '2026-09-01T00:00:00Z' });
    const { rows } = await as(db, id, `select public.start_free_trial() as ends`);
    expect(rows[0].ends).toBeNull();
    expect(await trialOf(db, id)).toBeNull();
  });

  it('requires a signed-in user', async () => {
    const { db } = await setup();
    await db.exec(`set role anon`);
    await expect(db.query(`select public.start_free_trial()`)).rejects.toThrow();
    await db.exec(`reset role`);
  });
});

describe('the privilege-column protection still holds', () => {
  it('cannot self-grant a trial date, Pro, or billing fields directly', async () => {
    const { db, id } = await setup();
    await as(db, id, `update public.profiles set trial_ends_at = '2099-01-01', is_premium = true, pro_status = 'active', stripe_customer_id = 'cus_x' where id = $1`, [id]);
    const { rows } = await db.query(`select trial_ends_at, is_premium, pro_status, stripe_customer_id from public.profiles where id = $1`, [id]);
    expect(rows[0]).toEqual({ trial_ends_at: null, is_premium: false, pro_status: null, stripe_customer_id: null });
  });

  it('after start_free_trial() ran, a later direct edit still cannot change the date', async () => {
    const { db, id } = await setup();
    await as(db, id, `select public.start_free_trial()`);
    const started = await trialOf(db, id);
    await as(db, id, `update public.profiles set trial_ends_at = '2099-01-01' where id = $1`, [id]);
    expect(new Date(await trialOf(db, id)).getTime()).toBe(new Date(started).getTime());
  });

  it('ordinary profile edits still save', async () => {
    const { db, id } = await setup();
    await as(db, id, `update public.profiles set name = 'Renamed', calorie_target = 1900 where id = $1`, [id]);
    const { rows } = await db.query(`select name, calorie_target from public.profiles where id = $1`, [id]);
    expect(rows[0]).toEqual({ name: 'Renamed', calorie_target: 1900 });
  });
});

describe('client and database agree on the trial', () => {
  it('start_free_trial() uses the same length as src/lib/trial.js', () => {
    expect(readSchema()).toContain(`ends := now() + interval '${TRIAL_DAYS} days';`);
  });
});
