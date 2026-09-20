import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const item = (over = {}) => ({ name: 'Oats', label: '60g', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4, ...over });
const DAYS = { mon: { breakfast: [item()], lunch: [item({ name: 'Chicken salad', calories: 480 })] }, sun: { snacks: [item({ name: 'Apple' })] } };
const valid = async (db, d) => (await db.query(`select public.valid_meal_plan_days($1::jsonb) v`, [JSON.stringify(d)])).rows[0].v;

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client, stranger };
}
const makePlan = (db, trainer, client, days = DAYS, extra = '') =>
  as(db, trainer, `insert into public.meal_plans (trainer_id, client_id, days ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $3::jsonb ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [trainer, client, JSON.stringify(days)]);

describe('valid_meal_plan_days', () => {
  it('accepts real plans, including empty and partial ones', async () => {
    const db = await createDb();
    expect(await valid(db, DAYS)).toBe(true);
    expect(await valid(db, {})).toBe(true);
    expect(await valid(db, { tue: {} })).toBe(true);
    expect(await valid(db, { tue: { lunch: [] } })).toBe(true);
    expect(await valid(db, { tue: { lunch: [{ name: 'Just a name' }] } })).toBe(true);        // macros optional
    expect(await valid(db, { tue: { lunch: [item({ calories: 0 })] } })).toBe(true);
    expect(await valid(db, { tue: { lunch: [item({ calories: 5000 })] } })).toBe(true);
  }, 60000);

  it('rejects each kind of malformed plan', async () => {
    const db = await createDb();
    const bad = [
      null, [], 'x', { monday: {} }, { mon: [] }, { mon: { brunch: [] } }, { mon: { lunch: {} } },
      { mon: { lunch: ['x'] } }, { mon: { lunch: [{}] } }, { mon: { lunch: [{ name: '' }] } }, { mon: { lunch: [{ name: 'x'.repeat(121) }] } },
      { mon: { lunch: [{ name: 5 }] } },
      { mon: { lunch: [item({ label: 'x'.repeat(61) })] } }, { mon: { lunch: [item({ label: 5 })] } },
      { mon: { lunch: [item({ calories: -1 })] } }, { mon: { lunch: [item({ calories: 5001 })] } }, { mon: { lunch: [item({ protein_g: 1001 })] } },
      { mon: { lunch: [item({ calories: '200' })] } }, { mon: { lunch: [item({ calories: null })] } },
      { mon: { lunch: [item({ sneaky: 1 })] } },
      { mon: { lunch: Array.from({ length: 21 }, () => item()) } },
    ];
    for (const d of bad) expect(await valid(db, d), JSON.stringify(d).slice(0, 80)).toBe(false);
    expect(await valid(db, { mon: { lunch: Array.from({ length: 20 }, () => item()) } })).toBe(true);
  }, 60000);

  it('accepts even the largest plan the shape rules allow (the 200 KB cap is a backstop, not a limit users hit)', async () => {
    const db = await createDb();
    const big = {};
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) big[day] = Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snacks'].map(m => [m, Array.from({ length: 20 }, () => item({ name: 'x'.repeat(120), label: 'y'.repeat(60) }))]));
    expect(JSON.stringify(big).length).toBeGreaterThan(100000);
    expect(JSON.stringify(big).length).toBeLessThan(200000);
    expect(await valid(db, big)).toBe(true);
  }, 60000);
});

describe('meal_plans', () => {
  it('lets a trainer create one plan per active client', async () => {
    const { db, trainer, client } = await setup();
    await makePlan(db, trainer, client);
    await expect(makePlan(db, trainer, client)).rejects.toThrow(/duplicate key/);
  }, 60000);

  it('rejects malformed content, names and notes at the table', async () => {
    const { db, trainer, client } = await setup();
    await expect(makePlan(db, trainer, client, { mon: { lunch: [{ name: '' }] } })).rejects.toThrow(/check constraint/);
    await expect(makePlan(db, trainer, client, DAYS, `name=''`)).rejects.toThrow(/check constraint/);
    await expect(makePlan(db, trainer, client, DAYS, `notes='${'x'.repeat(2001)}'`)).rejects.toThrow(/check constraint/);
  }, 60000);

  it('is refused for clients who are not active, or by someone else', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await expect(makePlan(db, trainer, stranger)).rejects.toThrow(/row-level security/);
    await expect(makePlan(db, other, client)).rejects.toThrow(/row-level security/);
    await svc(db, `update public.trainer_clients set status = 'pending' where trainer_id = $1`, [trainer]);
    await expect(makePlan(db, trainer, client)).rejects.toThrow(/row-level security/);
  }, 60000);

  it('is visible to its trainer, and to the addressed client only while active and linked', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    const { rows } = await makePlan(db, trainer, client);
    const id = rows[0].id;
    const count = async (uid) => (await as(db, uid, `select * from public.meal_plans`)).rows.length;
    expect([await count(trainer), await count(client), await count(other), await count(stranger)]).toEqual([1, 1, 0, 0]);
    await as(db, trainer, `update public.meal_plans set is_active = false where id = $1`, [id]);
    expect(await count(client)).toBe(0); // paused: hidden from the client
    expect(await count(trainer)).toBe(1);
    await as(db, trainer, `update public.meal_plans set is_active = true where id = $1`, [id]);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect(await count(client)).toBe(0); // disconnected
  }, 60000);

  it('cannot be edited or deleted by the client; only the trainer edits, and the target cannot be retargeted', async () => {
    const { db, trainer, client, stranger } = await setup();
    const id = (await makePlan(db, trainer, client)).rows[0].id;
    await as(db, client, `update public.meal_plans set name = 'hacked', days = '{}'::jsonb where id = $1`, [id]);
    await as(db, client, `delete from public.meal_plans where id = $1`, [id]);
    await as(db, trainer, `update public.meal_plans set name = 'Cut phase', client_id = $2 where id = $1`, [id, stranger]);
    const row = (await svc(db, `select * from public.meal_plans where id = $1`, [id])).rows[0];
    expect(row).toMatchObject({ name: 'Cut phase', client_id: client });
    expect(row.days).toEqual(DAYS);
  }, 60000);

  it('rejects an invalid edit without changing the stored plan, and touches updated_at on a valid one', async () => {
    const { db, trainer, client } = await setup();
    const id = (await makePlan(db, trainer, client)).rows[0].id;
    const before = (await svc(db, `select updated_at from public.meal_plans where id = $1`, [id])).rows[0].updated_at;
    await expect(as(db, trainer, `update public.meal_plans set days = $2::jsonb where id = $1`, [id, JSON.stringify({ mon: { lunch: [{ name: '' }] } })])).rejects.toThrow(/check constraint/);
    expect((await svc(db, `select days from public.meal_plans where id = $1`, [id])).rows[0].days).toEqual(DAYS);
    await new Promise(r => setTimeout(r, 20));
    await as(db, trainer, `update public.meal_plans set days = $2::jsonb where id = $1`, [id, JSON.stringify({ tue: { dinner: [item()] } })]);
    const after = (await svc(db, `select updated_at from public.meal_plans where id = $1`, [id])).rows[0].updated_at;
    expect(new Date(after) > new Date(before)).toBe(true);
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Meal plans (schema update');
    expect(block).toContain('valid_meal_plan_days');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
