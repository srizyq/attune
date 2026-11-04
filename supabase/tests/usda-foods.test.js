import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser } from './harness.js';
import { ESTIMATE_NUTRIENTS } from '../../src/lib/microEstimate.js';

const parts = [1, 2, 3].map((n) => readFileSync(new URL(`../usda_foods_part${n}of3.sql`, import.meta.url), 'utf8'));

describe('usda_foods', () => {
  it('has a column for every nutrient the app estimates, and signed-in users can read it', async () => {
    const db = await createDb();
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='usda_foods'`)).rows.map((r) => r.column_name);
    for (const m of ESTIMATE_NUTRIENTS) expect(cols, m.key).toContain(m.column);
    const user = await addUser(db, 'Sam');
    await db.query(`insert into public.usda_foods (id, name, calories) values ('usda-1', 'Chicken, breast, raw', 120)`);
    const rows = await asUser(db, user, async (q) => (await q(`select id from public.usda_foods`)).rows);
    expect(rows).toHaveLength(1);
  }, 60000);

  it('loads from the three data files, twice in a row, with real vitamins and NULL for what USDA lacks', async () => {
    const db = await createDb();
    for (const sql of [...parts, ...parts]) await db.exec(sql);
    const { rows } = await db.query(`select count(*)::int n, count(vitamin_c_mg) filter (where vitamin_c_mg > 0)::int vc, count(iodine_mcg)::int iodine from public.usda_foods`);
    expect(rows[0].n).toBeGreaterThan(7500);
    expect(rows[0].vc).toBeGreaterThan(2000);
    expect(rows[0].iodine).toBe(0); // SR Legacy has no iodine figures — unknown stays NULL
  }, 120000);

  it('search_usda_foods_ranked needs every word and puts the shortest name first', async () => {
    const db = await createDb();
    await db.query(`insert into public.usda_foods (id, name, calories) values ('a','Chicken, broilers, breast, meat only, cooked, roasted',165),('b','Chicken breast',120),('c','Beef, ground',250)`);
    const user = await addUser(db, 'Sam');
    const rows = await asUser(db, user, async (q) => (await q(`select name from public.search_usda_foods_ranked(array['\\mchicken','\\mbreast'], 5)`)).rows);
    expect(rows.map((r) => r.name)).toEqual(['Chicken breast', 'Chicken, broilers, breast, meat only, cooked, roasted']);
  }, 60000);
});
