import { describe, it, expect } from 'vitest';
import { ingredientEditState, rescaleIngredient, snapshotIngredient, evaluateRecipeDraft } from './recipeEdit';

const chicken = { name: 'Chicken breast', cal: 330, protein: 62, carbs: 0, fat: 7, servingGrams: 200, loggedAmount: 200, loggedUnit: 'g' };
const eggs = { name: 'Eggs', cal: 140, protein: 12, carbs: 1, fat: 10, servingGrams: 100, loggedAmount: 2, loggedUnit: 'serving' };
const mystery = { name: 'Mystery sauce', cal: 80, protein: 1, carbs: 10, fat: 4 }; // no weight on record

const row = (item, state = ingredientEditState(item)) => ({ item, ...state });

describe('ingredientEditState', () => {
  it('opens on the saved amount and unit', () => {
    expect(ingredientEditState(chicken)).toEqual({ amount: '200', unit: 'g' });
    expect(ingredientEditState(eggs)).toEqual({ amount: '2', unit: 'serving' });
  });
  it('opens on calories for an ingredient with no weight', () => {
    expect(ingredientEditState(mystery)).toEqual({ amount: '80', unit: 'serving' });
  });
});

describe('rescaleIngredient', () => {
  it('scales every nutrient by the amount and records the new quantity', () => {
    const out = rescaleIngredient(chicken, '100', 'g');
    expect(out).toMatchObject({ cal: 165, protein: 31, fat: 3.5, servingGrams: 100, loggedAmount: 100, loggedUnit: 'g' });
  });
  it('converts between units (200g -> 0.5 lb is ~227g)', () => {
    const out = rescaleIngredient(chicken, '0.5', 'lb');
    expect(out.servingGrams).toBe(227);
    expect(out.loggedUnit).toBe('lb');
    expect(out.cal).toBeCloseTo(330 * (226.796 / 200), -1);
  });
  it('handles servings: 2 eggs -> 3 eggs', () => {
    const out = rescaleIngredient(eggs, '3', 'serving');
    expect(out.cal).toBe(210);
    expect(out.servingGrams).toBe(150);
    expect(out.loggedAmount).toBe(3);
  });
  it('unchanged amount gives unchanged numbers', () => {
    const out = rescaleIngredient(chicken, '200', 'g');
    expect([out.cal, out.protein, out.carbs, out.fat]).toEqual([330, 62, 0, 7]);
  });
  it('never invents a weight for a calorie-only ingredient', () => {
    const out = rescaleIngredient(mystery, '160', 'serving'); // typed calories, double
    expect(out.cal).toBe(160);
    expect(out.servingGrams).toBeNull();
    expect(out).not.toHaveProperty('loggedAmount');
  });
  it('a zero or empty amount gives zero nutrition rather than NaN', () => {
    expect(rescaleIngredient(chicken, '', 'g').cal).toBe(0);
    expect(rescaleIngredient(chicken, '0', 'g').cal).toBe(0);
  });
  it('does not mutate the original', () => {
    const copy = { ...chicken };
    rescaleIngredient(chicken, '50', 'g');
    expect(chicken).toEqual(copy);
  });
});

describe('snapshotIngredient', () => {
  it('keeps the quantity fields and the nutrient totals', () => {
    const s = snapshotIngredient(rescaleIngredient(chicken, '100', 'g'));
    expect(s).toMatchObject({ name: 'Chicken breast', servingGrams: 100, loggedAmount: 100, loggedUnit: 'g', cal: 165 });
  });
  it('nulls missing quantity fields', () => {
    expect(snapshotIngredient(mystery)).toMatchObject({ servingGrams: null, loggedAmount: null, loggedUnit: null });
  });
});

describe('evaluateRecipeDraft', () => {
  const draft = (over = {}) => ({ name: 'Lunch', servings: 2, rows: [row(chicken), row(eggs)], ...over });
  it('totals and per-serving numbers follow the amounts', () => {
    const a = evaluateRecipeDraft(draft());
    expect(a.totals.cal).toBe(470);
    expect(a.perServing.cal).toBe(235);
    expect(a.error).toBeNull();
    const b = evaluateRecipeDraft(draft({ rows: [row(chicken, { amount: '100', unit: 'g' }), row(eggs)] }));
    expect(b.totals.cal).toBe(165 + 140);
  });
  it('reports the first problem in words', () => {
    expect(evaluateRecipeDraft(draft({ name: '  ' })).error).toMatch(/name/i);
    expect(evaluateRecipeDraft(draft({ servings: 0 })).error).toMatch(/servings/i);
    expect(evaluateRecipeDraft(draft({ servings: 'abc' })).error).toMatch(/servings/i);
    expect(evaluateRecipeDraft(draft({ rows: [] })).error).toMatch(/at least one ingredient/i);
    expect(evaluateRecipeDraft(draft({ rows: [row(chicken, { amount: '', unit: 'g' })] })).error).toMatch(/amount for Chicken breast/);
    expect(evaluateRecipeDraft(draft({ rows: [row(chicken, { amount: '-5', unit: 'g' })] })).error).toMatch(/amount/);
  });
  it('does not divide by zero servings', () => {
    const r = evaluateRecipeDraft(draft({ servings: 0 }));
    expect(Number.isFinite(r.perServing.cal)).toBe(true);
  });
});
