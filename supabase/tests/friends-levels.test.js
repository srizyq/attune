import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, sliceMigration } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

const DAY = '2026-10-16';
async function code(db, uid) { return (await as(db, uid, `select * from public.friends_me()`)).rows[0].invite_code; }
async function befriend(db, a, b) { await as(db, b, `select public.friends_add($1)`, [await code(db, a)]); }
async function eat(db, uid, name, cal, { day = DAY, protein = 10, carbs = 20, fat = 5 } = {}) {
  await db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories, protein_g, carbs_g, fat_g, brand) values ($1,$2,'lunch',$3,$4,$5,$6,$7,'SecretBrand')`,
    [uid, day, name, cal, protein, carbs, fat]);
}
const level = (db, uid, lvl) => as(db, uid, `select public.friends_set_share_level($1)`, [lvl]);
const list = async (db, uid, day = DAY) => (await as(db, uid, `select * from public.friends_list($1)`, [day])).rows;
const day = async (db, viewer, friend, d = DAY) => (await as(db, viewer, `select public.friends_day($1, $2) as d`, [friend, d])).rows[0].d;

// Ann watches Bo, who has eaten Eggs (300) and Rice (400).
async function setup() {
  const db = await createDb();
  const ann = await addUser(db, 'Ann'); const bo = await addUser(db, 'Bo');
  await befriend(db, ann, bo);
  await eat(db, bo, 'Eggs', 300, { protein: 20, carbs: 2, fat: 22 });
  await eat(db, bo, 'Rice', 400, { protein: 8, carbs: 80, fat: 1 });
  return { db, ann, bo };
}

describe('choosing what friends see', () => {
  it('starts at full, and friends_me reports the level and the older on/off value', async () => {
    const { db, bo } = await setup();
    const me = (await as(db, bo, `select * from public.friends_me()`)).rows[0];
    expect(me).toMatchObject({ share_level: 'full', share_day: true });
  }, 60000);

  it('accepts the three levels and keeps the on/off value in step', async () => {
    const { db, bo } = await setup();
    for (const [lvl, on] of [['totals', true], ['private', false], ['full', true]]) {
      await level(db, bo, lvl);
      expect((await as(db, bo, `select * from public.friends_me()`)).rows[0]).toMatchObject({ share_level: lvl, share_day: on });
    }
  }, 60000);

  it('rejects anything else, and someone not signed in', async () => {
    const { db, bo } = await setup();
    await rejects(level(db, bo, 'everything'), /friends_invalid_level/);
    await rejects(level(db, bo, null), /friends_invalid_level/);
    await rejects(level(db, bo, ''), /friends_invalid_level/);
    await rejects(db.query(`update public.friend_settings set share_level = 'nope'`), /check constraint/);
  }, 60000);

  it('only changes your own setting', async () => {
    const { db, ann, bo } = await setup();
    await level(db, ann, 'private');
    expect((await as(db, bo, `select * from public.friends_me()`)).rows[0].share_level).toBe('full');
    expect((await list(db, ann))[0].level).toBe('full'); // Bo is still full
  }, 60000);
});

describe('full', () => {
  it('shows the foods and the totals', async () => {
    const { db, ann, bo } = await setup();
    const [row] = await list(db, ann);
    expect(row).toMatchObject({ level: 'full', hidden: false });
    expect(Number(row.calories)).toBe(700);
    const d = await day(db, ann, bo);
    expect(d.level).toBe('full');
    expect(d.logs.map((l) => l.food_name)).toEqual(['Eggs', 'Rice']);
    expect(d.totals).toMatchObject({ items: 2, calories: 700, protein_g: 28, carbs_g: 82, fat_g: 23 });
  }, 60000);
});

describe('totals only', () => {
  it('gives friends the numbers but never what was eaten', async () => {
    const { db, ann, bo } = await setup();
    await level(db, bo, 'totals');
    const [row] = await list(db, ann);
    expect(row).toMatchObject({ level: 'totals', hidden: false });
    expect(Number(row.items)).toBe(2);
    expect(Number(row.calories)).toBe(700);
    expect(Number(row.protein_g)).toBe(28);
    const d = await day(db, ann, bo);
    expect(d.level).toBe('totals');
    expect(d.hidden).toBe(false);
    expect(d.logs).toEqual([]);
    expect(d.totals).toMatchObject({ items: 2, calories: 700, protein_g: 28, carbs_g: 82, fat_g: 23 });
  }, 60000);

  it('leaks no food name or brand anywhere in what a friend receives', async () => {
    const { db, ann, bo } = await setup();
    await level(db, bo, 'totals');
    const everything = JSON.stringify([await list(db, ann), await day(db, ann, bo)]);
    for (const secret of ['Eggs', 'Rice', 'SecretBrand', 'lunch']) expect(everything).not.toContain(secret);
  }, 60000);

  it('still never lets a friend read the log tables directly', async () => {
    const { db, ann, bo } = await setup();
    await level(db, bo, 'totals');
    expect((await as(db, ann, `select * from public.food_logs where user_id = $1`, [bo])).rows).toHaveLength(0);
    expect((await as(db, ann, `select * from public.friend_settings`)).rows).toHaveLength(0);
  }, 60000);
});

describe('private', () => {
  it('shows a friend nothing of the day', async () => {
    const { db, ann, bo } = await setup();
    await level(db, bo, 'private');
    const [row] = await list(db, ann);
    expect(row).toMatchObject({ level: 'none', hidden: true });
    expect(row.calories).toBeNull();
    expect(Number(row.items)).toBe(0);
    const d = await day(db, ann, bo);
    expect(d).toMatchObject({ level: 'none', hidden: true, totals: null, logs: [] });
    expect(JSON.stringify(d)).not.toContain('Eggs');
  }, 60000);
});

describe('hiding one day', () => {
  it('hides everything for that day at any level, and only that day', async () => {
    const { db, ann, bo } = await setup();
    await eat(db, bo, 'Toast', 150, { day: '2026-10-15' });
    for (const lvl of ['full', 'totals']) {
      await level(db, bo, lvl);
      await as(db, bo, `select public.friends_set_day_hidden($1, true)`, [DAY]);
      expect(await day(db, ann, bo)).toMatchObject({ level: 'none', hidden: true, totals: null, logs: [] });
      expect((await list(db, ann, '2026-10-15'))[0].level).toBe(lvl);
      await as(db, bo, `select public.friends_set_day_hidden($1, false)`, [DAY]);
      expect((await day(db, ann, bo)).level).toBe(lvl);
    }
  }, 60000);
});

describe('the older on/off switch', () => {
  it('off means private, and on returns to what you had chosen', async () => {
    const { db, ann, bo } = await setup();
    await level(db, bo, 'totals');
    await as(db, bo, `select public.friends_set_sharing(false)`);
    expect((await list(db, ann))[0].level).toBe('none');
    await as(db, bo, `select public.friends_set_sharing(true)`);
    expect((await list(db, ann))[0].level).toBe('full'); // came back from private: full
    await level(db, bo, 'totals');
    await as(db, bo, `select public.friends_set_sharing(true)`); // already on: leaves totals alone
    expect((await list(db, ann))[0].level).toBe('totals');
  }, 60000);

  it('works for someone who has never opened Friends', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await as(db, a, `select public.friends_set_sharing(false)`);
    expect((await as(db, a, `select * from public.friends_me()`)).rows[0]).toMatchObject({ share_level: 'private', share_day: false });
  }, 60000);
});

describe('who can ask', () => {
  it('only friends can see a day or a list, at any level', async () => {
    const { db, bo } = await setup();
    const cy = await addUser(db, 'Cy');
    await rejects(as(db, cy, `select public.friends_day($1, $2)`, [bo, DAY]), /friends_not_friends/);
    expect(await list(db, cy)).toHaveLength(0);
  }, 60000);
});

describe('shared recipes', () => {
  it('are not affected by the day-sharing level', async () => {
    const { db, ann, bo } = await setup();
    await as(db, bo, `insert into public.saved_meals (user_id, name, items, shared_with_friends) values ($1, 'Curry', '[]'::jsonb, true)`, [bo]);
    await level(db, bo, 'private');
    expect((await as(db, ann, `select name from public.friends_recipes($1)`, [bo])).rows.map((r) => r.name)).toEqual(['Curry']);
  }, 60000);
});

describe('migration', () => {
  it('turns an existing "not sharing" setting into private, and is safe to run twice', async () => {
    const { db, ann, bo } = await setup();
    // Someone who had switched sharing off before this update.
    await db.query(`update public.friend_settings set share_day = false, share_level = 'full' where user_id = $1`, [bo]);
    await db.exec(sliceMigration('Friends sharing levels'));
    await db.exec(sliceMigration('Friends sharing levels'));
    expect((await list(db, ann))[0].level).toBe('none');
    expect((await as(db, bo, `select * from public.friends_me()`)).rows[0].share_level).toBe('private');
  }, 60000);
});
