import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ searchAusnutFoods: vi.fn(), searchCommonDishes: vi.fn() }));
vi.mock('./db', () => db);
import { searchPlanFoods, ausnutToPlanFood, servingToPlanFood } from './planFoodSearch';

beforeEach(() => { db.searchAusnutFoods.mockResolvedValue([]); db.searchCommonDishes.mockResolvedValue([]); });

describe('ausnutToPlanFood', () => {
  it('keeps the food\'s per-100g values, at 100 g by default', () => {
    expect(ausnutToPlanFood({ id: 'F1', name: 'Rice, white, boiled', calories: 130.4, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3 })).toMatchObject({
      key: 'ausnut:F1', src: 'AUSNUT', defaultGrams: 100, per100: { calories: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3 },
    });
  });
  it('does not link a food whose numbers are beyond what a plan can hold', () => {
    expect(ausnutToPlanFood({ id: 'X', name: 'Odd', calories: 1500, protein_g: 0, carbs_g: 0, fat_g: 0 }).per100).toBeNull();
  });
});

describe('servingToPlanFood', () => {
  it('turns a per-serving food into per-100g using the serving weight', () => {
    const f = servingToPlanFood({ id: 'd1', name: 'Pad thai', serving_label: '1 plate', serving_grams: 400, calories: 800, protein_g: 32, carbs_g: 100, fat_g: 28 }, 'Common dish', 'dish');
    expect(f).toMatchObject({ key: 'dish:d1', src: 'Common dish', defaultGrams: 400, per100: { calories: 200, protein_g: 8, carbs_g: 25, fat_g: 7 }, servingLabel: '1 plate' });
  });
  it('falls back to a fixed serving when the weight is unknown', () => {
    const f = servingToPlanFood({ id: 'd2', name: 'Mystery', serving_grams: null, calories: 500, protein_g: 20, carbs_g: 50, fat_g: 20 }, 'My foods', 'custom');
    expect(f.per100).toBeNull();
    expect(f.fixed).toEqual({ calories: 500, protein_g: 20, carbs_g: 50, fat_g: 20 });
    expect(f.servingLabel).toBe('1 serving');
  });
});

describe('searchPlanFoods', () => {
  it('returns the coach\'s own foods first, then AUSNUT, then common dishes', async () => {
    db.searchAusnutFoods.mockResolvedValue([{ id: 'F1', name: 'Chicken, breast', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 }]);
    db.searchCommonDishes.mockResolvedValue([{ id: 'd1', name: 'Chicken curry', serving_label: '1 bowl', serving_grams: 350, calories: 600, protein_g: 40, carbs_g: 30, fat_g: 30 }]);
    const r = await searchPlanFoods('chicken', { customFoods: [{ id: 'c1', name: 'My chicken wrap', serving_grams: 220, calories: 450, protein_g: 35, carbs_g: 40, fat_g: 15 }, { id: 'c2', name: 'Oats' }] });
    expect(r.map((f) => f.src)).toEqual(['My foods', 'AUSNUT', 'Common dish']);
    expect(r[0].name).toBe('My chicken wrap');
  });

  it('every search word has to match one of the coach\'s own foods', async () => {
    const r = await searchPlanFoods('chicken wrap', { customFoods: [{ id: 'c1', name: 'My chicken wrap', serving_grams: 220, calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }, { id: 'c2', name: 'Chicken salad', serving_grams: 200, calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }] });
    expect(r.map((f) => f.name)).toEqual(['My chicken wrap']);
  });

  it('returns nothing for a blank query without touching the database', async () => {
    expect(await searchPlanFoods('   ')).toEqual([]);
    expect(db.searchAusnutFoods).not.toHaveBeenCalled();
  });

  it('keeps going when one source fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.searchAusnutFoods.mockRejectedValue(new Error('down'));
    db.searchCommonDishes.mockResolvedValue([{ id: 'd1', name: 'Chicken curry', serving_grams: 350, calories: 600, protein_g: 40, carbs_g: 30, fat_g: 30 }]);
    const r = await searchPlanFoods('chicken');
    expect(r.map((f) => f.src)).toEqual(['Common dish']);
  });
});
