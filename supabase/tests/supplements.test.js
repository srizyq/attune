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
