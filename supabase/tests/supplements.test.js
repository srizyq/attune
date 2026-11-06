import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

describe('supplements', () => {
  it('belongs to its owner: others cannot read, change or delete it', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const b = await addUser(db, 'Bo');
    await asUser(db, a, (q) => q(`insert into public.supplements (user_id, name, nutrients) values ($1, 'Vitamin D', '{"vitaminD": 25}')`, [a]));
    expect(await asUser(db, b, async (q) => (await q(`select * from public.supplements`)).rows)).toHaveLength(0);
    await asUser(db, b, (q) => q(`delete from public.supplements`));
    expect(await asUser(db, a, async (q) => (await q(`select name, serving_label, nutrients from public.supplements`)).rows)).toEqual([{ name: 'Vitamin D', serving_label: '1 serving', nutrients: { vitaminD: 25 } }]);
    await expect(asUser(db, b, (q) => q(`insert into public.supplements (user_id, name) values ($1, 'x')`, [a]))).rejects.toThrow();
  }, 60000);

  it('rejects an empty name and nutrients that are not an object', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await expect(asUser(db, a, (q) => q(`insert into public.supplements (user_id, name) values ($1, '')`, [a]))).rejects.toThrow();
    await expect(asUser(db, a, (q) => q(`insert into public.supplements (user_id, name, nutrients) values ($1, 'x', '[1]')`, [a]))).rejects.toThrow();
  }, 60000);
});

describe('profiles.life_stage', () => {
  it('defaults to none and only allows none, pregnant or breastfeeding', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    expect((await db.query(`select life_stage from public.profiles where id = $1`, [a])).rows[0].life_stage).toBe('none');
    await asUser(db, a, (q) => q(`update public.profiles set life_stage = 'pregnant' where id = $1`, [a]));
    await expect(asUser(db, a, (q) => q(`update public.profiles set life_stage = 'maybe' where id = $1`, [a]))).rejects.toThrow();
  }, 60000);
});

describe('supplements and friends', () => {
  it('a friend never sees a supplement you took, in the day list, the foods, or the item count', async () => {
    const db = await createDb();
    const ann = await addUser(db, 'Ann');
    const bo = await addUser(db, 'Bo');
    const as = (uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
    const code = (await as(ann, `select * from public.friends_me()`)).rows[0].invite_code;
    await as(bo, `select public.friends_add($1)`, [code]);
    await db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories, source) values ($1,'2026-10-16','lunch','Eggs',300,'local'), ($1,'2026-10-16','snacks','Vitamin D3',0,'supplement')`, [ann]);
    const d = (await as(bo, `select public.friends_day($1, '2026-10-16') as d`, [ann])).rows[0].d;
    expect(d.logs.map((l) => l.food_name)).toEqual(['Eggs']);
    expect(d.totals.items).toBe(1);
    const row = (await as(bo, `select * from public.friends_list('2026-10-16')`)).rows.find((r) => r.friend_id === ann);
    expect(Number(row.items)).toBe(1);
  }, 60000);
});
