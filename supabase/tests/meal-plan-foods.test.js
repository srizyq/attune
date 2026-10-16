import { describe, it, expect } from 'vitest';
import { createDb, sliceMigration } from './harness.js';

const valid = async (db, d) => (await db.query(`select public.valid_meal_plan_days($1::jsonb) v`, [JSON.stringify(d)])).rows[0].v;
const linked = (over = {}) => ({ name: 'Chicken breast, grilled', label: '150g', calories: 247, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, grams: 150, src: 'AUSNUT', per100: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 }, ...over });
const plan = (item) => ({ mon: { lunch: [item] } });

describe('valid_meal_plan_days — items linked to foods', () => {
  it('accepts an item with the food it came from, and still accepts plain items', async () => {
    const db = await createDb();
    expect(await valid(db, plan(linked()))).toBe(true);
    expect(await valid(db, plan({ name: 'Oats', label: '60g', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4 }))).toBe(true);
    expect(await valid(db, plan(linked({ grams: 0 })))).toBe(true);
    expect(await valid(db, plan(linked({ grams: 5000 })))).toBe(true);
    expect(await valid(db, plan(linked({ per100: { calories: 900, protein_g: 0, carbs_g: 0, fat_g: 100 } })))).toBe(true); // an oil
  }, 60000);

  it('rejects out-of-range or wrongly typed link fields', async () => {
    const db = await createDb();
    for (const bad of [
      linked({ grams: -1 }), linked({ grams: 5001 }), linked({ grams: '150' }),
      linked({ src: 5 }), linked({ src: 'x'.repeat(31) }),
      linked({ per100: 'x' }), linked({ per100: [] }),
      linked({ per100: { calories: 1001, protein_g: 0, carbs_g: 0, fat_g: 0 } }),
      linked({ per100: { calories: 100, protein_g: 101, carbs_g: 0, fat_g: 0 } }),
      linked({ per100: { calories: -1 } }),
      linked({ per100: { calories: '165' } }),
      linked({ per100: { calories: 165, sodium_mg: 5 } }),
    ]) expect(await valid(db, plan(bad))).toBe(false);
  }, 60000);

  it('still rejects unknown item fields (the allow-list did not become "anything")', async () => {
    const db = await createDb();
    expect(await valid(db, plan({ ...linked(), secret: 'x' }))).toBe(false);
    expect(await valid(db, plan({ name: 'x', is_admin: true }))).toBe(false);
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly, and is what the full schema ends up with', async () => {
    const db = await createDb();
    const block = sliceMigration('Meal plan items linked to foods (schema update');
    expect(block).toContain('per100');
    await db.exec(block);
    await db.exec(block);
    expect(await valid(db, plan(linked()))).toBe(true);
  }, 60000);
});
