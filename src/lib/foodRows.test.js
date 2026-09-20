import { describe, it, expect, vi } from 'vitest';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('./db', () => ({ getFoodLogsForDate: vi.fn(), addFoodLog: vi.fn(), deleteFoodLog: vi.fn(), updateFoodLog: vi.fn() }));
import { foodNutrientsFromRow, loggedRowToFood, favouriteRowToFood } from './foodRows';
import { MICRO_NUTRIENTS, EXTENDED_KEYS, MICRO_KEYS } from './microNutrients';

// A food_logs row with a real value in every older nutrient column.
const fullRow = () => ({
  id: 'r1', food_name: 'Salmon', meal: 'dinner', source: 'ausnut', serving_grams: 150, logged_amount: 1, logged_unit: 'serving',
  calories: 300, protein_g: 30, carbs_g: 1, fat_g: 18,
  fibre_g: 2, sodium_mg: 70, sugar_g: 0.5, saturated_fat_g: 3.5, trans_fat_g: 0.1, cholesterol_mg: 80, potassium_mg: 500,
  added_sugar_g: 0.2, vitamin_d_mcg: 12, calcium_mg: 20, iron_mg: 0.6, vitamin_a_mcg: 30, vitamin_c_mg: 1.5,
  vitamin_b12_mcg: 4.2, folate_mcg: 25, magnesium_mg: 40, zinc_mg: 0.7, polyunsaturated_fat_g: 5, monounsaturated_fat_g: 7,
});

describe('foodNutrientsFromRow', () => {
  it('carries every micronutrient the row has, not just fibre/sodium/sugar (the reported bug)', () => {
    const got = foodNutrientsFromRow(fullRow());
    expect(got).toMatchObject({
      cal: 300, protein: 30, carbs: 1, fat: 18,
      fibre: 2, sodium: 70, sugar: 0.5, saturatedFat: 3.5, transFat: 0.1, cholesterol: 80, potassium: 500, addedSugar: 0.2,
      vitaminD: 12, calcium: 20, iron: 0.6, vitaminA: 30, vitaminC: 1.5, vitaminB12: 4.2, folate: 25, magnesium: 40, zinc: 0.7,
      polyunsaturatedFat: 5, monounsaturatedFat: 7,
    });
  });

  it('returns every nutrient in the registry, and only nutrients (never id, name, meal or source)', () => {
    const got = foodNutrientsFromRow(fullRow());
    for (const key of MICRO_KEYS) expect(key in got, key).toBe(true);
    expect(Object.keys(got).sort()).toEqual(['cal', 'carbs', 'fat', 'protein', ...MICRO_KEYS].sort());
    expect(MICRO_NUTRIENTS).toHaveLength(32);
  });

  it('keeps unknown extended nutrients null rather than turning them into zero', () => {
    const got = foodNutrientsFromRow({ ...fullRow(), thiamin_mg: null, selenium_mcg: undefined });
    for (const key of EXTENDED_KEYS) expect(got[key], key).toBeNull();
  });

  it('keeps a measured extended zero and real extended values', () => {
    const got = foodNutrientsFromRow({ ...fullRow(), caffeine_mg: 0, thiamin_mg: '0.25', omega3_mg: 320 });
    expect(got.caffeine).toBe(0);
    expect(got.thiamin).toBe(0.25);
    expect(got.omega3).toBe(320);
    expect(got.selenium).toBeNull();
  });

  it('reads a favourite_foods row too (same column names), tolerating its missing columns', () => {
    const got = foodNutrientsFromRow({ id: 'f1', name: 'Oats', calories: 200, protein_g: 8, calcium_mg: 40, vitamin_a_mcg: 12 });
    expect(got).toMatchObject({ cal: 200, protein: 8, calcium: 40, vitaminA: 12, zinc: 0, fibre: 0 });
    expect(got.thiamin).toBeNull();
  });

  it('copes with an empty row without NaN', () => {
    const got = foodNutrientsFromRow({});
    expect(Object.values(got).some(Number.isNaN)).toBe(false);
    expect(got.cal).toBe(0);
  });
});

describe('loggedRowToFood (Recent / Frequent cards)', () => {
  const row = { ...fullRow(), logged_amount: '200', logged_unit: 'g' };

  it('keeps every existing field and adds the nutrients', () => {
    const food = loggedRowToFood(row, { idPrefix: 'recent_', meta: 'Logged before', cuisine: 'all' });
    expect(food).toMatchObject({
      id: 'recent_r1', name: 'Salmon', meta: 'Logged before', cuisine: 'all', servingGrams: 150, source: 'ausnut',
      lastAmount: 200, lastUnit: 'g', cal: 300, protein: 30, carbs: 1, fat: 18,
      calcium: 20, vitaminB12: 4.2, zinc: 0.7, fibre: 2, sodium: 70,
    });
  });

  it('has no cuisine for Frequent cards, and applies the same fallbacks as before', () => {
    const food = loggedRowToFood({ id: 'r2', food_name: 'Toast', calories: 80 }, { idPrefix: 'freq_', meta: 'Logged often' });
    expect('cuisine' in food).toBe(false);
    expect(food).toMatchObject({ id: 'freq_r2', servingGrams: 100, source: 'log', lastAmount: null, lastUnit: null, cal: 80 });
  });

  it('stays null for unknown extended nutrients on the card', () => {
    const food = loggedRowToFood(row, { idPrefix: 'recent_', meta: 'm' });
    for (const key of EXTENDED_KEYS) expect(food[key], key).toBeNull();
  });
});

describe('favouriteRowToFood', () => {
  const row = { id: 'f1', name: 'Oats', serving_grams: 60, source: null, calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4, fibre_g: 5, calcium_mg: 40, vitamin_a_mcg: 12, zinc_mg: 1.2, thiamin_mg: 0.3 };

  it('carries the vitamins and minerals a favourite now stores, and the last-used amount', () => {
    const food = favouriteRowToFood(row, { meta: '1 serving', last: { amount: 2, unit: 'serving' } });
    expect(food).toMatchObject({ id: 'fav_f1', name: 'Oats', meta: '1 serving', servingGrams: 60, source: 'favourite', lastAmount: 2, lastUnit: 'serving', cal: 220, fibre: 5, calcium: 40, vitaminA: 12, zinc: 1.2, thiamin: 0.3 });
    expect(food.selenium).toBeNull();
  });

  it('works without a last-used lookup, and for a favourite saved before the update', () => {
    const food = favouriteRowToFood({ id: 'f2', name: 'Milk', calories: 60, calcium_mg: 120 }, { meta: 'x', last: undefined });
    expect(food).toMatchObject({ lastAmount: null, lastUnit: null, servingGrams: 100, calcium: 120, vitaminA: 0 });
    expect(food.thiamin).toBeNull();
  });
});

