import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';
import { computeTrendWeight, assessTDEE } from '../../src/lib/adaptiveTDEE.js';
import { ON_TARGET_TOLERANCE, COMPLETE_DAY_MEALS, PROTEIN_HIT } from '../../src/lib/adherence.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const TODAY = '2026-09-20'; // a Sunday

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, client };
}
const date = (offset) => new Date(Date.UTC(2026, 8, 20 + offset)).toISOString().slice(0, 10);
// One logged meal slot on a day.
const meal = (db, client, offset, slot, cal, prot = 0) => svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories, protein_g) values ($1, $2, $3, 'x', $4, $5)`, [client, date(offset), slot, cal, prot]);
// A whole day: `slots` meal slots sharing `cal` calories between them.
async function day(db, client, offset, cal, { prot = 0, slots = 3 } = {}) {
  const names = ['breakfast', 'lunch', 'dinner', 'snacks'].slice(0, slots);
  for (const s of names) await meal(db, client, offset, s, cal / slots, prot / slots);
}
const summary = async (db, trainer) => (await as(db, trainer, `select * from public.get_client_summaries($1)`, [TODAY])).rows[0];

describe('the "on target" definition is one definition', () => {
  it('matches the constants the app uses', async () => {
    // The SQL hard-codes 0.9 / 1.1 / 3 meals / 0.9 protein; the app imports them from adherence.js.
    // Probe both sides at the edges so a change to either one fails here.
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2100, protein_g = 100 where id = $1`, [client]);
    expect(ON_TARGET_TOLERANCE).toBe(0.1);
    expect(COMPLETE_DAY_MEALS).toBe(3);
    expect(PROTEIN_HIT).toBe(0.9);
    // (calories chosen to split evenly across 3 meals, so the edges are exact)
    await day(db, client, -1, 2310, { prot: 90 });   // exactly +10% and exactly 90% protein: in
    await day(db, client, -2, 1890, { prot: 90 });   // exactly -10%: in
    await day(db, client, -3, 2352, { prot: 87 });   // +12% (inside the old 15% rule, outside this one), protein short
    await day(db, client, -4, 1869, { prot: 100 });  // -11%: out
    const r = await summary(db, trainer);
    expect(r).toMatchObject({ days_logged_7d: 4, days_complete_7d: 4, days_judged_7d: 4, days_on_target_7d: 2, days_protein_7d: 3 });
  }, 60000);

  it('does not let a partly-logged day count as on target', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000, protein_g = 100 where id = $1`, [client]);
    await day(db, client, -1, 2000, { prot: 100, slots: 3 });  // complete, on target
    await day(db, client, -2, 2000, { prot: 100, slots: 2 });  // only 2 slots logged, calories happen to land on target
    const r = await summary(db, trainer);
    expect(r).toMatchObject({ days_logged_7d: 2, days_complete_7d: 1, days_on_target_7d: 1, days_protein_7d: 1 });
  }, 60000);

  it('judges a past partial day (a miss) but leaves today out until it is complete', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000 where id = $1`, [client]);
    await day(db, client, -1, 800, { slots: 1 });   // yesterday: only breakfast — a day they didn't finish
    await day(db, client, 0, 400, { slots: 1 });    // today so far: just breakfast
    let r = await summary(db, trainer);
    expect(r).toMatchObject({ days_logged_7d: 2, days_complete_7d: 0, days_judged_7d: 1, days_on_target_7d: 0 });
    await meal(db, client, 0, 'lunch', 700);
    await meal(db, client, 0, 'dinner', 900);       // today is now complete, 2000 kcal
    r = await summary(db, trainer);
    expect(r).toMatchObject({ days_complete_7d: 1, days_judged_7d: 2, days_on_target_7d: 1 });
  }, 60000);

  it('averages calories over complete days separately from all logged days', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000 where id = $1`, [client]);
    await day(db, client, -1, 2000);
    await day(db, client, -2, 2400);
    await day(db, client, -3, 500, { slots: 1 });
    const r = await summary(db, trainer);
    expect(Number(r.avg_cal_complete_7d)).toBe(2200);
    expect(Math.round(Number(r.avg_cal_7d))).toBe(1633);
  }, 60000);

  it('still uses each day\'s own target on a rest-day schedule', async () => {
    const { db, trainer, client } = await setup();
    // Sunday (today) is a rest day; training Mon/Wed/Fri.
    await svc(db, `update public.profiles set calorie_target = 2500, rest_day_targets = '{"calories": 1800}', training_days = '{1,3,5}' where id = $1`, [client]);
    await day(db, client, 0, 1800);   // Sun rest: on
    await day(db, client, -2, 2500);  // Fri training: on
    await day(db, client, -3, 2500);  // Thu rest: 2500 vs 1800 off
    const r = await summary(db, trainer);
    expect(r).toMatchObject({ calorie_target: 1800, days_on_target_7d: 2 });
  }, 60000);
});

describe('weight rate: planned vs actual', () => {
  const weigh = (db, client, offset, kg, unit = 'kg') => svc(db, `insert into public.weight_logs (user_id, logged_date, weight, unit) values ($1, $2, $3, $4)`, [client, date(offset), kg, unit]);

  it('returns the chosen pace and the robust weekly rate', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set goal = 'lose', pace_kg_per_week = 0.5 where id = $1`, [client]);
    // 0.07 kg/day loss for 21 days, one salty-dinner spike
    for (let i = 0; i <= 21; i++) await weigh(db, client, i - 21, 80 - 0.07 * i + (i === 9 ? 2.5 : 0));
    const r = await summary(db, trainer);
    expect(Number(r.pace_kg_per_week)).toBe(0.5);
    expect(r.weigh_ins_28d).toBe(22);
    expect(Number(r.weight_rate_kg_week)).toBeCloseTo(-0.49, 1);
  }, 60000);

  it('gives the same answer as the app\'s own rate (robustSlopeKgPerDay) for the same weigh-ins', async () => {
    const { db, trainer, client } = await setup();
    const noise = [0.4, -0.6, 0.9, -0.3, 0.2, -1.1, 0.7, 0.1, -0.5, 1.0, -0.2, 0.3];
    const logs = [];
    for (let i = 0; i < 12; i++) logs.push({ off: -26 + i * 2 + (i % 3 === 0 ? 1 : 0), kg: 90 - 0.05 * (i * 2) + noise[i] });
    for (const l of logs) await weigh(db, client, l.off, l.kg);
    const sql = Number((await summary(db, trainer)).weight_rate_kg_week);
    // JS: the 'estimate' reports weeklyRateKg from the same pairwise-median slope.
    const trend = computeTrendWeight(logs.map((l) => ({ weight: l.kg, unit: 'kg', logged_date: date(l.off) })));
    const calories = logs.map((l) => ({ date: date(l.off), calories: 2000 }));
    const js = assessTDEE(trend, calories);
    expect(js.ok).toBe(true);
    expect(sql).toBeCloseTo(js.estimate.weeklyRateKg, 2);
  }, 60000);

  it('converts pounds', async () => {
    const { db, trainer, client } = await setup();
    for (let i = 0; i <= 14; i++) await weigh(db, client, i - 14, 176 - 0.1 * i * 2.20462, 'lb');
    const r = await summary(db, trainer);
    expect(Number(r.weight_rate_kg_week)).toBeCloseTo(-0.7, 1);
  }, 60000);

  it('says nothing from too few weigh-ins or too short a stretch', async () => {
    const { db, trainer, client } = await setup();
    for (const off of [-20, -10, 0]) await weigh(db, client, off, 80);
    expect((await summary(db, trainer)).weight_rate_kg_week).toBeNull();           // 3 weigh-ins
    await weigh(db, client, -5, 80);
    expect((await summary(db, trainer)).weight_rate_kg_week).not.toBeNull();       // 4 over 20 days
    const other = await addUser(db, 'Short');
    await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, other]);
    for (const off of [-8, -6, -4, -2, 0]) await weigh(db, other, off, 70);
    const rows = (await as(db, trainer, `select client_name, weight_rate_kg_week from public.get_client_summaries($1)`, [TODAY])).rows;
    expect(rows.find((x) => x.client_name === 'Short').weight_rate_kg_week).toBeNull(); // 5 weigh-ins but only 8 days
  }, 60000);
});

describe('who owns the client\'s targets', () => {
  const ownership = async (db, client) => (await svc(db, `select targets_set_by, targets_set_at, targets_overridden_at, calorie_target, protein_g, calorie_mode from public.profiles where id = $1`, [client])).rows[0];

  it('marks targets as the coach\'s, with the exact numbers, when a coach sets them', async () => {
    const { db, trainer, client } = await setup();
    await as(db, trainer, `select public.set_client_targets($1, 2100, 150, 220, 70)`, [client]);
    const p = await ownership(db, client);
    expect(p).toMatchObject({ targets_set_by: trainer, calorie_target: 2100, protein_g: 150, calorie_mode: 'custom' });
    expect(p.targets_set_at).toBeTruthy();
    expect(p.targets_overridden_at).toBeNull();
    expect((await summary(db, trainer)).targets_set_by).toBe(trainer);
  }, 60000);

  it('lets the client take them back, recording when — and does nothing for a client with no coach targets', async () => {
    const { db, trainer, client } = await setup();
    await as(db, client, `select public.override_coach_targets()`);
    expect((await ownership(db, client)).targets_overridden_at).toBeNull(); // nothing to take back
    await as(db, trainer, `select public.set_client_targets($1, 2100, 150, 220, 70)`, [client]);
    await as(db, client, `select public.override_coach_targets()`);
    const p = await ownership(db, client);
    expect(p.targets_set_by).toBeNull();
    expect(p.targets_overridden_at).toBeTruthy();
    expect(p.calorie_target).toBe(2100); // the numbers stay; ownership moves
    const r = await summary(db, trainer);
    expect(r.targets_set_by).toBeNull();
    expect(r.targets_overridden_at).toBeTruthy();
  }, 60000);

  it('a coach setting targets again clears the "client changed them" mark', async () => {
    const { db, trainer, client } = await setup();
    await as(db, trainer, `select public.set_client_targets($1, 2100, 150, 220, 70)`, [client]);
    await as(db, client, `select public.override_coach_targets()`);
    await as(db, trainer, `select public.set_client_targets($1, 2000, 150, 200, 65)`, [client]);
    const p = await ownership(db, client);
    expect(p).toMatchObject({ targets_set_by: trainer, calorie_target: 2000 });
    expect(p.targets_overridden_at).toBeNull();
  }, 60000);

  it('only ever touches the caller\'s own row, and anonymous callers cannot call it', async () => {
    const { db, trainer, client } = await setup();
    const bystander = await addUser(db, 'Bystander');
    await as(db, trainer, `select public.set_client_targets($1, 2100, 150, 220, 70)`, [client]);
    await as(db, bystander, `select public.override_coach_targets()`);
    expect((await ownership(db, client)).targets_set_by).toBe(trainer);
    await db.exec(`set role anon`);
    await expect(db.query(`select public.override_coach_targets()`)).rejects.toThrow();
    await db.exec(`reset role`);
  }, 60000);

  it('still refuses a trainer who is not linked to the client', async () => {
    const { db, client } = await setup();
    const stranger = await addUser(db, 'Stranger', { coachPass: true });
    await expect(as(db, stranger, `select public.set_client_targets($1, 1, 1, 1, 1)`, [client])).rejects.toThrow('Not an active trainer');
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Coach insights and target ownership (schema update');
    expect(block).toContain('override_coach_targets');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
