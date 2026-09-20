import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser, sliceMigration } from './harness.js';
import { MICRO_NUTRIENTS, EXTENDED_NUTRIENTS } from '../../src/lib/microNutrients.js';

const foods = JSON.parse(readFileSync(new URL('../../scripts/import-ausnut/ausnut-foods.json', import.meta.url), 'utf8'));
const parts = [1, 2, 3].map((n) => readFileSync(new URL(`../ausnut_micronutrients_backfill_part${n}of3.sql`, import.meta.url), 'utf8'));
const NEW_COLUMNS = ['saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'potassium_mg', 'added_sugar_g', 'vitamin_d_mcg', 'calcium_mg', 'iron_mg', ...EXTENDED_NUTRIENTS.map((m) => m.column)];
// What ausnut_foods held before this update: everything in the JSON except the new columns.
const baseOnly = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !NEW_COLUMNS.includes(k)));

const columnInfo = async (db, table) => Object.fromEntries((await db.query(
  `select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1`, [table])).rows.map((r) => [r.column_name, r]));

describe('food_logs columns', () => {
  it('has a column for every nutrient in the app, and the extended ones are NULL-by-default', async () => {
    const db = await createDb();
    const cols = await columnInfo(db, 'food_logs');
    for (const m of MICRO_NUTRIENTS) expect(cols[m.column], `${m.key} -> ${m.column}`).toBeTruthy();
    for (const m of EXTENDED_NUTRIENTS) {
      expect(cols[m.column].is_nullable).toBe('YES');
      expect(cols[m.column].column_default, `${m.column} must default to NULL, not 0`).toBeNull();
    }
  }, 60000);

  it('keeps unknown as NULL, and a measured zero as zero', async () => {
    const db = await createDb();
    const user = await addUser(db, 'Sam');
    await asUser(db, user, (q) => q(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Mystery', 100)`, [user]));
    await asUser(db, user, (q) => q(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories, caffeine_mg, thiamin_mg) values ($1, current_date, 'lunch', 'Water', 0, 0, 0.25)`, [user]));
    const rows = (await db.query(`select food_name, caffeine_mg, thiamin_mg, calcium_mg from public.food_logs order by food_name`)).rows;
    expect(rows[0]).toMatchObject({ food_name: 'Mystery', caffeine_mg: null, thiamin_mg: null });
    expect(Number(rows[0].calcium_mg)).toBe(0); // older columns keep their default
    expect(rows[1]).toMatchObject({ food_name: 'Water' });
    expect(Number(rows[1].caffeine_mg)).toBe(0);
    expect(Number(rows[1].thiamin_mg)).toBe(0.25);
  }, 60000);
});

describe('micro_nutrient_keys', () => {
  it('lists every nutrient, so a trainer can set a target for the new ones too', async () => {
    const db = await createDb();
    const { rows } = await db.query(`select unnest(public.micro_nutrient_keys()) k`);
    expect(rows.map((r) => r.k).sort()).toEqual(MICRO_NUTRIENTS.map((m) => m.key).sort());
  }, 60000);
});

describe('ausnut_foods backfill', () => {
  async function loadedDb() {
    const db = await createDb();
    // Recreate the pre-update state: every food present, none of the new columns filled.
    const before = await columnInfo(db, 'ausnut_foods');
    expect(Object.keys(before)).toEqual(expect.arrayContaining(NEW_COLUMNS));
    await db.query(`insert into public.ausnut_foods select * from json_populate_recordset(null::public.ausnut_foods, $1::json)`, [JSON.stringify(foods.map(baseOnly))]);
    return db;
  }

  it('has the columns, with the eight already-tracked nutrients defaulting to 0 and the extended ones to NULL', async () => {
    const db = await createDb();
    const cols = await columnInfo(db, 'ausnut_foods');
    for (const c of ['saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'potassium_mg', 'added_sugar_g', 'vitamin_d_mcg', 'calcium_mg', 'iron_mg']) expect(cols[c].column_default).toBe('0');
    for (const m of EXTENDED_NUTRIENTS) expect(cols[m.column].column_default).toBeNull();
  }, 60000);

  it('fills every food with exactly the values from the official spreadsheet, touching nothing else', async () => {
    const db = await loadedDb();
    const snapshot = (await db.query(`select id, name, calories, protein_g, folate_mcg from public.ausnut_foods order by id`)).rows;
    for (const sql of parts) await db.exec(sql);

    const { rows } = await db.query(`select * from public.ausnut_foods order by id`);
    expect(rows).toHaveLength(foods.length);
    const byId = new Map(foods.map((f) => [f.id, f]));
    let checked = 0;
    for (const row of rows) {
      const src = byId.get(row.id);
      for (const c of NEW_COLUMNS) {
        expect(Number(row[c]), `${row.id}.${c}`).toBeCloseTo(src[c], 4);
        checked += 1;
      }
    }
    expect(checked).toBe(foods.length * NEW_COLUMNS.length);
    // Nothing outside the new columns changed.
    const after = (await db.query(`select id, name, calories, protein_g, folate_mcg from public.ausnut_foods order by id`)).rows;
    expect(after).toEqual(snapshot);
  }, 120000);

  it('is idempotent: running the parts again changes nothing and adds or removes no rows', async () => {
    const db = await loadedDb();
    for (const sql of parts) await db.exec(sql);
    const first = (await db.query(`select * from public.ausnut_foods order by id`)).rows;
    for (const sql of [...parts].reverse()) await db.exec(sql); // any order
    const second = (await db.query(`select * from public.ausnut_foods order by id`)).rows;
    expect(second).toEqual(first);
  }, 120000);

  it('the parts together cover every food exactly once', () => {
    const ids = parts.flatMap((sql) => [...sql.matchAll(/^\s*\('(F\d+)'/gm)].map((m) => m[1]));
    expect(ids).toHaveLength(foods.length);
    expect(new Set(ids).size).toBe(foods.length);
    expect(new Set(ids)).toEqual(new Set(foods.map((f) => f.id)));
  });

  it('gives the AUSNUT foods that used to log as zero their real values', async () => {
    const db = await loadedDb();
    for (const sql of parts) await db.exec(sql);
    const { rows } = await db.query(`select count(*) filter (where calcium_mg > 0)::int ca, count(*) filter (where iron_mg > 0)::int fe, count(*) filter (where caffeine_mg > 0)::int caf, count(*) filter (where thiamin_mg is null)::int nulls from public.ausnut_foods`);
    expect(rows[0].ca).toBeGreaterThan(3000);
    expect(rows[0].fe).toBeGreaterThan(3000);
    expect(rows[0].caf).toBeGreaterThan(300); // caffeine is genuinely 0 for most foods
    expect(rows[0].nulls).toBe(0);
  }, 120000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Extended micronutrients (schema update');
    expect(block).toContain('thiamin_mg');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
