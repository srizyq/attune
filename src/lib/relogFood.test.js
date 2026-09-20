import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ payloads: [] }));
vi.mock('./supabase', () => {
  const chain = (payload) => { h.payloads.push(payload); const c = { select: () => c, single: () => Promise.resolve({ data: { id: 'new' }, error: null }) }; return c; };
  return { supabase: { from: () => ({ insert: chain, upsert: chain }) } };
});
import { addFoodLog, addFavouriteFood } from './db';
import { foodNutrientsFromRow } from './foodRows';
import { scaleFood } from './foodMath';

// The whole round trip the bug broke: a logged row -> a Recent/Favourite card
// -> logged again. Every nutrient must arrive as it left.
const logged = {
  id: 'r1', food_name: 'Salmon', meal: 'dinner', calories: 300, protein_g: 30, carbs_g: 1, fat_g: 18,
  fibre_g: 2, sodium_mg: 70, sugar_g: 0.5, saturated_fat_g: 3.5, trans_fat_g: 0.1, cholesterol_mg: 80, potassium_mg: 500,
  added_sugar_g: 0.2, vitamin_d_mcg: 12, calcium_mg: 20, iron_mg: 0.6, vitamin_a_mcg: 30, vitamin_c_mg: 1.5, vitamin_b12_mcg: 4.2,
  folate_mcg: 25, magnesium_mg: 40, zinc_mg: 0.7, polyunsaturated_fat_g: 5, monounsaturated_fat_g: 7,
  thiamin_mg: 0.25, caffeine_mg: 0, selenium_mcg: null, // measured, measured zero, unknown
};
beforeEach(() => { h.payloads.length = 0; });

describe('re-logging a Recent / Frequent food', () => {
  const relog = async (servings = 1) => {
    // What FoodSearch builds for the card, then scales and logs.
    const card = { name: 'Salmon', servingGrams: 150, source: 'log', ...foodNutrientsFromRow(logged) };
    await addFoodLog('u1', { loggedDate: '2026-09-21', meal: 'dinner', ...scaleFood(card, servings), name: card.name, source: card.source });
    return h.payloads[0];
  };

  it('writes every older micronutrient back (it used to write 0 for all but fibre/sodium/sugar)', async () => {
    const p = await relog();
    expect(p).toMatchObject({
      fibre_g: 2, sodium_mg: 70, sugar_g: 0.5, saturated_fat_g: 3.5, trans_fat_g: 0.1, cholesterol_mg: 80, potassium_mg: 500,
      added_sugar_g: 0.2, vitamin_d_mcg: 12, calcium_mg: 20, iron_mg: 0.6, vitamin_a_mcg: 30, vitamin_c_mg: 1.5, vitamin_b12_mcg: 4.2,
      folate_mcg: 25, magnesium_mg: 40, zinc_mg: 0.7, polyunsaturated_fat_g: 5, monounsaturated_fat_g: 7,
    });
  });

  it('writes extended nutrients it has, keeps a measured zero, and leaves an unknown one out (stays NULL)', async () => {
    const p = await relog();
    expect(p.thiamin_mg).toBe(0.25);
    expect(p.caffeine_mg).toBe(0);
    expect('selenium_mcg' in p).toBe(false);
    expect('iodine_mcg' in p).toBe(false);
  });

  it('scales the micronutrients with the portion', async () => {
    const p = await relog(2);
    expect(p.calcium_mg).toBe(40);
    expect(p.vitamin_b12_mcg).toBe(8.4);
    expect(p.thiamin_mg).toBe(0.5);
    expect(p.caffeine_mg).toBe(0);
  });
});

describe('starring a food (favourite_foods)', () => {
  const food = { name: 'Salmon', meta: '1 serving', servingGrams: 150, source: 'log', ...foodNutrientsFromRow(logged) };

  it('keeps the vitamins, minerals and extended nutrients, not just the original eleven', async () => {
    await addFavouriteFood('u1', food);
    expect(h.payloads[0]).toMatchObject({
      name: 'Salmon', calcium_mg: 20, fibre_g: 2,
      vitamin_a_mcg: 30, vitamin_c_mg: 1.5, vitamin_b12_mcg: 4.2, folate_mcg: 25, magnesium_mg: 40, zinc_mg: 0.7,
      polyunsaturated_fat_g: 5, monounsaturated_fat_g: 7, thiamin_mg: 0.25, caffeine_mg: 0,
    });
    expect('selenium_mcg' in h.payloads[0]).toBe(false);
  });

  it('a food with none of the newer nutrients sends none of the newer columns', async () => {
    await addFavouriteFood('u1', { name: 'Toast', cal: 80, protein: 3, carbs: 14, fat: 1, calcium: 20 });
    const keys = Object.keys(h.payloads[0]);
    for (const k of ['vitamin_a_mcg', 'vitamin_c_mg', 'zinc_mg', 'thiamin_mg', 'caffeine_mg']) expect(keys, k).not.toContain(k);
    expect(h.payloads[0].calcium_mg).toBe(20);
  });
});
