import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, sliceMigration } from './harness.js';
import { MICRO_NUTRIENTS, EXTENDED_NUTRIENTS, FAVOURITE_LATE_KEYS, lateFavouriteToRow } from '../../src/lib/microNutrients.js';

const columns = async (db) => Object.fromEntries((await db.query(
  `select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'favourite_foods'`)).rows.map((r) => [r.column_name, r]));

describe('favourite_foods columns', () => {
  it('has a column for every nutrient the app tracks (so none can be silently dropped)', async () => {
    const db = await createDb();
    const cols = await columns(db);
    for (const n of MICRO_NUTRIENTS) expect(cols[n.column], `${n.key} -> ${n.column}`).toBeTruthy();
  }, 60000);

  it('the older nutrients default to 0 and the extended ones to NULL (unknown is not zero)', async () => {
    const db = await createDb();
    const cols = await columns(db);
    for (const n of MICRO_NUTRIENTS.filter((m) => !m.extended)) expect(cols[n.column].column_default, n.key).toBe('0');
    for (const n of EXTENDED_NUTRIENTS) {
      expect(cols[n.column].is_nullable).toBe('YES');
      expect(cols[n.column].column_default, `${n.column} must default to NULL`).toBeNull();
    }
  }, 60000);

  it('round-trips a starred food: vitamins and minerals kept, unknown stays NULL, a measured zero stays 0', async () => {
    const db = await createDb();
    const user = await addUser(db, 'Sam');
    // What addFavouriteFood sends for a food with some late older nutrients and some extended ones.
    const late = lateFavouriteToRow({ vitaminA: 120, zinc: 2.5, folate: 0, thiamin: 0.25, caffeine: 0, selenium: null });
    const cols = Object.keys(late);
    await asUser(db, user, (q) => q(
      `insert into public.favourite_foods (user_id, name, calories, ${cols.join(', ')}) values ($1, 'Oats', 200, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
      [user, ...Object.values(late)]));
    const [row] = (await asUser(db, user, (q) => q(`select * from public.favourite_foods`))).rows;
    expect(Number(row.vitamin_a_mcg)).toBe(120);
    expect(Number(row.zinc_mg)).toBe(2.5);
    expect(Number(row.folate_mcg)).toBe(0);      // late older nutrient not sent -> column default
    expect(Number(row.thiamin_mg)).toBe(0.25);
    expect(Number(row.caffeine_mg)).toBe(0);     // measured zero is kept
    expect(row.selenium_mcg).toBeNull();          // never sent -> unknown
    expect(row.iodine_mcg).toBeNull();
  }, 60000);

  it('a favourite saved before this update (only the original columns) still works', async () => {
    const db = await createDb();
    const user = await addUser(db, 'Sam');
    await asUser(db, user, (q) => q(`insert into public.favourite_foods (user_id, name, calories, fibre_g, calcium_mg) values ($1, 'Milk', 60, 0, 120)`, [user]));
    const [row] = (await asUser(db, user, (q) => q(`select * from public.favourite_foods`))).rows;
    expect(Number(row.calcium_mg)).toBe(120);
    expect(Number(row.vitamin_c_mg)).toBe(0);
    expect(row.thiamin_mg).toBeNull();
  }, 60000);

  it('the "late" list is exactly the older nutrients the table originally lacked', async () => {
    const original = ['fibre', 'sodium', 'sugar', 'saturatedFat', 'transFat', 'cholesterol', 'addedSugar', 'potassium', 'vitaminD', 'calcium', 'iron'];
    const older = MICRO_NUTRIENTS.filter((m) => !m.extended).map((m) => m.key);
    expect([...FAVOURITE_LATE_KEYS].sort()).toEqual(older.filter((k) => !original.includes(k)).sort());
  });
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Favourite foods: all nutrients (schema update');
    expect(block).toContain('thiamin_mg');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
