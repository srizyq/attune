import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

const DAY = '2026-10-16';
async function code(db, uid) { return (await as(db, uid, `select * from public.friends_me()`)).rows[0].invite_code; }
async function befriend(db, a, b) { await as(db, b, `select public.friends_add($1)`, [await code(db, a)]); }
async function eat(db, uid, name, cal, { day = DAY, protein = 10, carbs = 20, fat = 5, meal = 'lunch' } = {}) {
  await db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories, protein_g, carbs_g, fat_g) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid, day, meal, name, cal, protein, carbs, fat]);
}
const list = async (db, uid, day = DAY) => (await as(db, uid, `select * from public.friends_list($1)`, [day])).rows;

describe('invite codes', () => {
  it('gives each person their own stable code', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    const ca = await code(db, a);
    expect(ca).toMatch(/^[0-9A-F]{10}$/);
    expect(await code(db, a)).toBe(ca);
    expect(await code(db, b)).not.toBe(ca);
  }, 60000);

  it('previews who an invite is from, tolerating case and stray characters', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    const ca = await code(db, a);
    const r = (await as(db, b, `select * from public.friends_preview($1)`, [` ${ca.toLowerCase().slice(0, 5)}-${ca.toLowerCase().slice(5)} `])).rows;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ friend_id: a, name: 'Ann', already: false });
    expect((await as(db, b, `select * from public.friends_preview('NOPE')`)).rows).toHaveLength(0);
  }, 60000);
});

describe('adding and removing friends', () => {
  it('opening a link makes you friends both ways at once', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    expect((await list(db, a)).map((r) => r.name)).toEqual(['Bo']);
    expect((await list(db, b)).map((r) => r.name)).toEqual(['Ann']);
  }, 60000);

  it('adding twice, or from the other side, still gives one friendship', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b); await befriend(db, a, b); await befriend(db, b, a);
    expect((await db.query(`select count(*)::int as n from public.friendships`)).rows[0].n).toBe(1);
  }, 60000);

  it('rejects your own code and an unknown code', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await rejects(as(db, a, `select public.friends_add($1)`, [await code(db, a)]), /friends_self/);
    await rejects(as(db, a, `select public.friends_add('ZZZZZZZZZZ')`), /friends_invalid_code/);
  }, 60000);

  it('either person can remove the friendship', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo'); const c = await addUser(db, 'Cy');
    await befriend(db, a, b); await befriend(db, a, c);
    await as(db, b, `select public.friends_remove($1)`, [a]);
    expect((await list(db, a)).map((r) => r.name)).toEqual(['Cy']);
    expect(await list(db, b)).toHaveLength(0);
  }, 60000);

  it('is rate limited', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    const c = await code(db, a);
    await db.query(`insert into public.rate_limits (key, hits) values ($1, 40)`, [`community:friend_add:${b}`]); // 40 used
    await rejects(as(db, b, `select public.friends_add($1)`, [c]), /community_rate_limited/);
  }, 60000);

  it('nobody can create a friendship directly', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    const [lo, hi] = a < b ? [a, b] : [b, a];
    await rejects(as(db, a, `insert into public.friendships (user_a, user_b) values ($1, $2)`, [lo, hi]), /row-level security/);
  }, 60000);
});

describe('what friends see', () => {
  it('lists friends with the day\'s totals and targets', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await db.query(`update public.profiles set calorie_target = 2000, protein_g = 150 where id = $1`, [b]);
    await befriend(db, a, b);
    await eat(db, b, 'Eggs', 300, { protein: 20, carbs: 2, fat: 22, meal: 'breakfast' });
    await eat(db, b, 'Rice', 400, { protein: 8, carbs: 80, fat: 1 });
    await eat(db, b, 'Yesterday', 999, { day: '2026-10-15' });
    const [row] = await list(db, a);
    expect(row).toMatchObject({ friend_id: b, name: 'Bo', hidden: false });
    expect(Number(row.items)).toBe(2);
    expect(Number(row.calories)).toBe(700);
    expect(Number(row.protein_g)).toBe(28);
    expect(Number(row.carbs_g)).toBe(82);
    expect(Number(row.fat_g)).toBe(23);
    expect(Number(row.calorie_target)).toBe(2000);
    expect(row.carbs_target).toBeNull();
  }, 60000);

  it('shows the friend\'s foods for the day, in order, and not other days', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await eat(db, b, 'Eggs', 300, { meal: 'breakfast' });
    await eat(db, b, 'Old', 100, { day: '2026-10-01' });
    const d = (await as(db, a, `select public.friends_day($1, $2) as d`, [b, DAY])).rows[0].d;
    expect(d.name).toBe('Bo');
    expect(d.hidden).toBe(false);
    expect(d.logs.map((l) => l.food_name)).toEqual(['Eggs']);
    expect(d.logs[0]).toMatchObject({ meal: 'breakfast', calories: 300 });
    expect(d.logs[0]).not.toHaveProperty('user_id');
  }, 60000);

  it('only friends can see a day, a list or recipes', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo'); const c = await addUser(db, 'Cy');
    await befriend(db, a, b);
    await eat(db, b, 'Eggs', 300);
    await rejects(as(db, c, `select public.friends_day($1, $2)`, [b, DAY]), /friends_not_friends/);
    await rejects(as(db, c, `select * from public.friends_recipes($1)`, [b]), /friends_not_friends/);
    expect(await list(db, c)).toHaveLength(0);
    // and not by reading the tables directly
    expect((await as(db, c, `select * from public.food_logs where user_id = $1`, [b])).rows).toHaveLength(0);
    expect((await as(db, a, `select * from public.food_logs where user_id = $1`, [b])).rows).toHaveLength(0);
  }, 60000);

  it('removing a friend stops them seeing anything', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await as(db, a, `select public.friends_remove($1)`, [b]);
    await rejects(as(db, a, `select public.friends_day($1, $2)`, [b, DAY]), /friends_not_friends/);
  }, 60000);
});

describe('hiding your day', () => {
  it('the sharing switch hides everything from friends', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await eat(db, b, 'Eggs', 300);
    await as(db, b, `select public.friends_set_sharing(false)`);
    const [row] = await list(db, a);
    expect(row.hidden).toBe(true);
    expect(row.calories).toBeNull();
    const d = (await as(db, a, `select public.friends_day($1, $2) as d`, [b, DAY])).rows[0].d;
    expect(d.hidden).toBe(true);
    expect(d.logs).toEqual([]);
    await as(db, b, `select public.friends_set_sharing(true)`);
    expect((await list(db, a))[0].hidden).toBe(false);
  }, 60000);

  it('hiding one day leaves the others visible, and can be undone', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await eat(db, b, 'Eggs', 300);
    await eat(db, b, 'Toast', 150, { day: '2026-10-15' });
    await as(db, b, `select public.friends_set_day_hidden($1, true)`, [DAY]);
    expect((await list(db, a))[0].hidden).toBe(true);
    expect((await list(db, a, '2026-10-15'))[0].hidden).toBe(false);
    expect((await as(db, b, `select * from public.friends_hidden_days($1, $2)`, ['2026-10-01', '2026-10-31'])).rows.map((r) => r.friends_hidden_days.toISOString?.().slice(0, 10) ?? r.friends_hidden_days)).toEqual([DAY]);
    await as(db, b, `select public.friends_set_day_hidden($1, false)`, [DAY]);
    expect((await list(db, a))[0].hidden).toBe(false);
  }, 60000);

  it('a friend cannot change what you hide', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await as(db, a, `select public.friends_set_day_hidden($1, true)`, [DAY]);
    expect((await as(db, b, `select * from public.friend_hidden_days`)).rows).toHaveLength(0);
  }, 60000);
});

describe('shared recipes', () => {
  it('friends see only the recipes marked shared', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo'); const c = await addUser(db, 'Cy');
    await befriend(db, a, b);
    await as(db, b, `insert into public.saved_meals (user_id, name, items, servings, shared_with_friends) values ($1, 'Shared curry', '[{"name":"Rice"}]'::jsonb, 2, true)`, [b]);
    await as(db, b, `insert into public.saved_meals (user_id, name, items) values ($1, 'Secret', '[]'::jsonb)`, [b]);
    const rows = (await as(db, a, `select * from public.friends_recipes($1)`, [b])).rows;
    expect(rows.map((r) => r.name)).toEqual(['Shared curry']);
    expect(Number(rows[0].servings)).toBe(2);
    expect(rows[0].items).toEqual([{ name: 'Rice' }]);
    await rejects(as(db, c, `select * from public.friends_recipes($1)`, [b]), /friends_not_friends/);
  }, 60000);
});

describe('deleting an account', () => {
  it('removes its friendships and settings', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await db.query(`delete from auth.users where id = $1`, [b]);
    expect((await db.query(`select * from public.friendships`)).rows).toHaveLength(0);
    expect((await db.query(`select * from public.friend_settings where user_id = $1`, [b])).rows).toHaveLength(0);
  }, 60000);
});
