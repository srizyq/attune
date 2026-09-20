import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';
import { targetsForDate, parseDayTargetInputs, MAX_CALORIES, MAX_GRAMS } from '../../src/lib/dayTargets.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const day = (offset) => `(date '2026-09-20' + ${offset})`; // fixed "today" = Sunday 2026-09-20

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client, stranger };
}
const setDay = (db, who, client, rest, days) => as(db, who, `select public.set_client_day_targets($1, $2::jsonb, $3::int[])`, [client, rest === null ? null : JSON.stringify(rest), days]);
const stored = async (db, client) => (await svc(db, `select rest_day_targets, training_days, calorie_mode from public.profiles where id = $1`, [client])).rows[0];
const food = (db, client, offset, cal, protein = 0) =>
  svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories, protein_g) values ($1, ${day(offset)}, 'lunch', 'x', $2, $3)`, [client, cal, protein]);

describe('target_for_date', () => {
  const t = async (db, base, rest, key, training, date) =>
    (await db.query(`select public.target_for_date($1::numeric, $2::jsonb, $3, $4::int[], $5::date) v`, [base, rest && JSON.stringify(rest), key, training, date])).rows[0].v;

  it('uses the base target unless rest-day targets AND training days are both set', async () => {
    const db = await createDb();
    expect(Number(await t(db, 2500, null, 'calories', [1, 3, 5], '2026-09-20'))).toBe(2500);          // no rest targets
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', null, '2026-09-20'))).toBe(2500); // no training days
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [], '2026-09-20'))).toBe(2500);
    expect(await t(db, null, null, 'calories', null, '2026-09-20')).toBeNull();
  }, 60000);

  it('uses the rest-day target on days that are not training days', async () => {
    const db = await createDb();
    // Mon 2026-09-21 is a training day (1); Sun 09-20 and Tue 09-22 are not.
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [1], '2026-09-21'))).toBe(2500);
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [1], '2026-09-20'))).toBe(1800);
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [1], '2026-09-22'))).toBe(1800);
  }, 60000);

  it('falls back to the base target for a nutrient the rest set leaves out, and honours an explicit 0', async () => {
    const db = await createDb();
    expect(Number(await t(db, 180, { calories: 1800 }, 'protein_g', [1], '2026-09-20'))).toBe(180);
    expect(Number(await t(db, 300, { carbs_g: 0 }, 'carbs_g', [1], '2026-09-20'))).toBe(0);
  }, 60000);

  it('treats Sunday as day 0 and Saturday as 6 (the numbering JavaScript uses)', async () => {
    const db = await createDb();
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [0], '2026-09-20'))).toBe(2500); // Sunday
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [6], '2026-09-19'))).toBe(2500); // Saturday
    expect(Number(await t(db, 2500, { calories: 1800 }, 'calories', [6], '2026-09-20'))).toBe(1800);
  }, 60000);

  it('agrees with src/lib/dayTargets.js for every weekday across many shapes', async () => {
    const db = await createDb();
    const shapes = [
      { profile: { calorie_target: 2500, protein_g: 180, rest_day_targets: { calories: 1800 }, training_days: [1, 3, 5] } },
      { profile: { calorie_target: 2500, protein_g: 180, rest_day_targets: { calories: 1800, protein_g: 0, fat_g: 40 }, training_days: [0, 6] } },
      { profile: { calorie_target: null, protein_g: null, rest_day_targets: { calories: 1500 }, training_days: [2] } },
      { profile: { calorie_target: 2200, protein_g: 150, rest_day_targets: null, training_days: [1, 2] } },
      { profile: { calorie_target: 2200, protein_g: 150, rest_day_targets: { calories: 1500 }, training_days: [] } },
    ];
    const keys = [['calories', 'calorie_target'], ['protein_g', 'protein_g'], ['carbs_g', 'carbs_g'], ['fat_g', 'fat_g']];
    for (const { profile } of shapes) {
      for (let i = 0; i < 14; i++) {
        const date = new Date(Date.UTC(2026, 8, 14 + i)).toISOString().slice(0, 10);
        const js = targetsForDate(profile, date);
        for (const [key, col] of keys) {
          const sql = (await db.query(`select public.target_for_date($1::numeric, $2::jsonb, $3, $4::int[], $5::date) v`,
            [profile[col] ?? null, profile.rest_day_targets && JSON.stringify(profile.rest_day_targets), key, profile.training_days, date])).rows[0].v;
          expect(sql === null ? null : Number(sql), `${date} ${key} ${JSON.stringify(profile)}`).toBe(js[key]);
        }
      }
    }
  }, 120000);
});

describe('validation in the database', () => {
  it('accepts valid rest-day targets and training days on a profile', async () => {
    const { db, client } = await setup();
    await svc(db, `update public.profiles set rest_day_targets = '{"calories": 1800, "protein_g": 150}'::jsonb, training_days = '{1,3,5}' where id = $1`, [client]);
    expect((await stored(db, client)).training_days).toEqual([1, 3, 5]);
  }, 60000);

  it.each([
    ['unknown key', `'{"sugar": 5}'`],
    ['a non-number', `'{"calories": "1800"}'`],
    ['a negative', `'{"calories": -1}'`],
    ['too many calories', `'{"calories": 20001}'`],
    ['too many grams', `'{"protein_g": 2001}'`],
    ['an array', `'[1800]'`],
    ['a bare number', `'1800'`],
  ])('rejects rest-day targets with %s', async (_label, json) => {
    const { db, client } = await setup();
    await expect(svc(db, `update public.profiles set rest_day_targets = ${json}::jsonb where id = $1`, [client])).rejects.toThrow(/profiles_rest_day_targets_valid/);
  }, 60000);

  it('accepts the exact limits', async () => {
    const { db, client } = await setup();
    await svc(db, `update public.profiles set rest_day_targets = '{"calories": 20000, "fat_g": 2000, "carbs_g": 0}'::jsonb where id = $1`, [client]);
  }, 60000);

  it.each([
    ['a day above 6', `'{7}'`],
    ['a negative day', `'{-1}'`],
    ['a duplicate day', `'{1,1}'`],
    ['a null day', `'{1,null}'`],
  ])('rejects training days with %s', async (_label, arr) => {
    const { db, client } = await setup();
    await expect(svc(db, `update public.profiles set training_days = ${arr}::int[] where id = $1`, [client])).rejects.toThrow(/profiles_training_days_valid/);
  }, 60000);

  it('the JS limits match the database limits', async () => {
    const { db, client } = await setup();
    expect(parseDayTargetInputs({ calories: String(MAX_CALORIES) }, [1]).error).toBeNull();
    expect(parseDayTargetInputs({ calories: String(MAX_CALORIES + 1) }, [1]).error).not.toBeNull();
    expect(parseDayTargetInputs({ fat_g: String(MAX_GRAMS) }, [1]).error).toBeNull();
    expect(parseDayTargetInputs({ fat_g: String(MAX_GRAMS + 1) }, [1]).error).not.toBeNull();
    await svc(db, `update public.profiles set rest_day_targets = $2::jsonb where id = $1`, [client, JSON.stringify({ calories: MAX_CALORIES, fat_g: MAX_GRAMS })]);
    await expect(svc(db, `update public.profiles set rest_day_targets = $2::jsonb where id = $1`, [client, JSON.stringify({ calories: MAX_CALORIES + 1 })])).rejects.toThrow();
  }, 60000);
});

describe('set_client_day_targets', () => {
  it('lets a trainer set rest-day targets and training days for an active client, and switches to custom mode', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_mode = 'adaptive' where id = $1`, [client]);
    await setDay(db, trainer, client, { calories: 1800, protein_g: 160 }, [5, 1, 3]);
    expect(await stored(db, client)).toEqual({ rest_day_targets: { calories: 1800, protein_g: 160 }, training_days: [1, 3, 5], calorie_mode: 'custom' });
  }, 60000);

  it('replaces both, so clearing really clears — and leaves the calorie mode alone', async () => {
    const { db, trainer, client } = await setup();
    await setDay(db, trainer, client, { calories: 1800 }, [1]);
    await svc(db, `update public.profiles set calorie_mode = 'adaptive' where id = $1`, [client]);
    await setDay(db, trainer, client, null, null);
    expect(await stored(db, client)).toEqual({ rest_day_targets: null, training_days: null, calorie_mode: 'adaptive' });
    await setDay(db, trainer, client, { calories: 1800 }, [1]);
    await setDay(db, trainer, client, {}, []);
    expect((await stored(db, client)).rest_day_targets).toBeNull();
    expect((await stored(db, client)).training_days).toBeNull();
  }, 60000);

  it('drops null entries, sorts the days, and treats an empty target set as none', async () => {
    const { db, trainer, client } = await setup();
    await setDay(db, trainer, client, { calories: 1800, protein_g: null }, [3, 1]);
    expect(await stored(db, client)).toMatchObject({ rest_day_targets: { calories: 1800 }, training_days: [1, 3] });
    await setDay(db, trainer, client, { calories: null }, [3]);
    expect((await stored(db, client)).rest_day_targets).toBeNull();
  }, 60000);

  it('rejects unknown targets, non-numbers, out-of-range values, non-objects and bad days — writing nothing', async () => {
    const { db, trainer, client } = await setup();
    await expect(setDay(db, trainer, client, { sugar: 5 }, [1])).rejects.toThrow('Unknown target: sugar');
    await expect(setDay(db, trainer, client, { calories: '1800' }, [1])).rejects.toThrow('must be a number');
    await expect(setDay(db, trainer, client, { calories: -5 }, [1])).rejects.toThrow('out of range');
    await expect(setDay(db, trainer, client, { protein_g: 1e6 }, [1])).rejects.toThrow('out of range');
    await expect(as(db, trainer, `select public.set_client_day_targets($1, '[1]'::jsonb, '{1}')`, [client])).rejects.toThrow('must be an object');
    await expect(setDay(db, trainer, client, { calories: 1800 }, [7])).rejects.toThrow('distinct weekdays');
    await expect(setDay(db, trainer, client, { calories: 1800 }, [1, 1])).rejects.toThrow('distinct weekdays');
    expect(await stored(db, client)).toMatchObject({ rest_day_targets: null, training_days: null });
  }, 60000);

  it('refuses anyone who is not the client\'s active trainer', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    for (const who of [other, stranger, client]) await expect(setDay(db, who, client, { calories: 1800 }, [1])).rejects.toThrow('Not an active trainer');
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    await expect(setDay(db, trainer, client, { calories: 1800 }, [1])).rejects.toThrow('Not an active trainer');
    await svc(db, `update public.trainer_clients set status = 'pending' where trainer_id = $1`, [trainer]);
    await expect(setDay(db, trainer, client, { calories: 1800 }, [1])).rejects.toThrow('Not an active trainer');
  }, 60000);

  it('lets a client set their own (they can already update their own profile)', async () => {
    const { db, client } = await setup();
    await as(db, client, `update public.profiles set rest_day_targets = '{"calories": 1700}'::jsonb, training_days = '{2,4}' where id = $1`, [client]);
    expect(await stored(db, client)).toMatchObject({ rest_day_targets: { calories: 1700 }, training_days: [2, 4] });
  }, 60000);
});

describe('get_client_summaries is day-aware', () => {
  it('judges each day against that day\'s own target, and reports today\'s target', async () => {
    const { db, trainer, client } = await setup();
    // Today is Sunday 2026-09-20 (a rest day). Training days: Mon, Wed, Fri.
    await svc(db, `update public.profiles set calorie_target = 2500, protein_g = 180, rest_day_targets = '{"calories": 1800, "protein_g": 120}', training_days = '{1,3,5}' where id = $1`, [client]);
    await food(db, client, 0, 1800, 120);   // Sun, rest: on target, protein hit
    await food(db, client, -2, 2500, 180);  // Fri, training: on target, protein hit
    await food(db, client, -3, 2500, 100);  // Thu, rest: 2500 vs 1800 -> off; protein 100 < 108 -> miss
    await food(db, client, -4, 1800, 120);  // Wed, training: 1800 vs 2500 -> off; protein 120 < 162 -> miss
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ calorie_target: 1800, protein_g: 120, days_logged_7d: 4, days_on_target_7d: 2, days_protein_7d: 2 });
  }, 60000);

  it('reports the training-day target on a training day', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2500, rest_day_targets = '{"calories": 1800}', training_days = '{1,3,5}' where id = $1`, [client]);
    expect((await as(db, trainer, `select calorie_target from public.get_client_summaries('2026-09-21')`)).rows[0].calorie_target).toBe(2500); // Monday
    expect((await as(db, trainer, `select calorie_target from public.get_client_summaries('2026-09-22')`)).rows[0].calorie_target).toBe(1800); // Tuesday
  }, 60000);

  it('is identical to before for a client without rest-day targets', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000, protein_g = 150 where id = $1`, [client]);
    await food(db, client, 0, 2000, 150);
    await food(db, client, -1, 2200, 100);
    await food(db, client, -2, 1000, 140);
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ calorie_target: 2000, protein_g: 150, days_logged_7d: 3, days_on_target_7d: 2, days_protein_7d: 2 });
  }, 60000);

  it('rest-day targets alone (no training days chosen) change nothing', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set calorie_target = 2000, rest_day_targets = '{"calories": 1000}' where id = $1`, [client]);
    await food(db, client, 0, 2000);
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ calorie_target: 2000, days_on_target_7d: 1 });
  }, 60000);

  it('counts a rest-day target for a client whose base target is unset', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set rest_day_targets = '{"calories": 1800}', training_days = '{5}' where id = $1`, [client]);
    await food(db, client, 0, 1800);  // Sunday: rest day, target 1800
    await food(db, client, -2, 1800); // Friday: training day, no base target -> not counted
    const [r] = (await as(db, trainer, `select * from public.get_client_summaries('2026-09-20')`)).rows;
    expect(r).toMatchObject({ calorie_target: 1800, days_on_target_7d: 1 });
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Training-day / rest-day targets (schema update');
    expect(block).toContain('set_client_day_targets');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
