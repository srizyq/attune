import { describe, it, expect } from 'vitest';
import { buildDayPost, buildMealPost, buildRecipePost, postToLogRows, recipePostToSavedMeal, needsLowCalorieCheck, timeAgo, initialsOf, canShareRecipe } from './communityPosts.js';

const item = (name, cal, p, c, f, meal = 'lunch') => ({ name, cal, protein: p, carbs: c, fat: f, fibre: 2, meal });
const ITEMS = [item('Oats', 350, 14, 52, 9, 'breakfast'), item('Chicken bowl', 640, 46, 52, 26, 'lunch')];

describe('building posts', () => {
  it('a day sums its items, labels today as partial, and carries the goal percentage', () => {
    const p = buildDayPost({ date: '2026-10-06', today: '2026-10-06', items: ITEMS, targetCalories: 2000 });
    expect(p.kind).toBe('day');
    expect(p.payload).toMatchObject({ title: 'Today so far', partial: true, calories: 990, protein_g: 60, carbs_g: 104, fat_g: 35, goal_pct: 50 });
    expect(p.payload.items).toHaveLength(2);
    expect(p.payload.items[0]).toMatchObject({ name: 'Oats', calories: 350, meal: 'breakfast' });
  });
  it('a past day is named for its weekday and is not partial', () => {
    const p = buildDayPost({ date: '2026-10-05', today: '2026-10-06', items: ITEMS, targetCalories: 0 });
    expect(p.payload.title).toBe('Monday');
    expect(p.payload.partial).toBe(false);
    expect(p.payload).not.toHaveProperty('goal_pct');
  });
  it('a meal names itself after a single item, or the meal', () => {
    expect(buildMealPost({ meal: 'lunch', date: '2026-10-06', items: [ITEMS[1]] }).payload.title).toBe('Chicken bowl');
    expect(buildMealPost({ meal: 'dinner', date: '2026-10-06', items: ITEMS }).payload.title).toBe('Dinner');
    expect(buildMealPost({ title: 'My lunch', meal: 'lunch', date: 'x', items: ITEMS }).payload.title).toBe('My lunch');
    expect(buildMealPost({ meal: 'nonsense', date: 'x', items: ITEMS }).payload.meal).toBe('snacks');
  });
  it('a recipe posts per-serving numbers and its ingredients', () => {
    const r = buildRecipePost({ name: 'Overnight oats', servings: 2, items: [{ ...item('Oats', 300, 10, 50, 6), servingGrams: 80 }, item('Milk', 100, 8, 12, 2)] });
    expect(r.payload).toMatchObject({ title: 'Overnight oats', servings: 2, calories: 200, protein_g: 9, carbs_g: 31, fat_g: 4 });
    expect(r.payload.ingredients).toHaveLength(2);
    expect(r.payload.ingredients[0].grams).toBe(80);
    expect(canShareRecipe({ items: [] })).toBe(false);
    expect(canShareRecipe({ items: [1] })).toBe(true);
  });
  it('caps the item list and clips long names', () => {
    const many = Array.from({ length: 100 }, (_, i) => item(`Food ${i}`, 10, 1, 1, 1));
    expect(buildDayPost({ date: 'd', today: 'x', items: many }).payload.items).toHaveLength(80);
    expect(buildMealPost({ meal: 'lunch', date: 'd', items: [item('x'.repeat(200), 1, 1, 1, 1)] }).payload.items[0].name).toHaveLength(80);
  });
});

describe('the low-calorie check-in', () => {
  it('only applies to a finished day under 1,200 kcal', () => {
    expect(needsLowCalorieCheck('day', { calories: 900, partial: false })).toBe(true);
    expect(needsLowCalorieCheck('day', { calories: 900, partial: true })).toBe(false);
    expect(needsLowCalorieCheck('day', { calories: 1200, partial: false })).toBe(false);
    expect(needsLowCalorieCheck('day', { calories: 0, partial: false })).toBe(false);
    expect(needsLowCalorieCheck('meal', { calories: 200 })).toBe(false);
  });
});

describe('copying a post to your log', () => {
  const day = buildDayPost({ date: '2026-10-05', today: '2026-10-06', items: ITEMS, targetCalories: 2000 });
  it('a day goes back into the meals it was eaten in, on the chosen date', () => {
    const rows = postToLogRows(day, 'u1', { date: '2026-10-06' });
    expect(rows.map((r) => [r.food_name, r.meal])).toEqual([['Oats', 'breakfast'], ['Chicken bowl', 'lunch']]);
    expect(rows[0]).toMatchObject({ user_id: 'u1', logged_date: '2026-10-06', calories: 350, protein_g: 14, source: 'community' });
  });
  it('a meal goes into the meal you pick', () => {
    const meal = buildMealPost({ meal: 'lunch', date: '2026-10-05', items: ITEMS });
    const rows = postToLogRows(meal, 'u1', { meal: 'dinner', date: '2026-10-06' });
    expect(rows.every((r) => r.meal === 'dinner')).toBe(true);
  });
  it('a recipe adds the chosen number of servings as one entry', () => {
    const rec = buildRecipePost({ name: 'Oats', servings: 2, items: [item('Oats', 300, 10, 50, 6)] });
    const [row] = postToLogRows(rec, 'u1', { meal: 'breakfast', date: '2026-10-06', servings: 1.5 });
    expect(row).toMatchObject({ food_name: 'Oats', meal: 'breakfast', calories: 225 });
  });
  it('a post with no item list still copies its totals', () => {
    const rows = postToLogRows({ kind: 'meal', payload: { title: 'Lunch', calories: 500, protein_g: 30, carbs_g: 40, fat_g: 20 } }, 'u1', { meal: 'lunch', date: 'd' });
    expect(rows).toHaveLength(1);
    expect(rows[0].calories).toBe(500);
  });
  it('a recipe post becomes a saved recipe', () => {
    const rec = buildRecipePost({ name: 'Oats', servings: 2, items: [{ ...item('Oats', 300, 10, 50, 6), servingGrams: 80 }] });
    expect(recipePostToSavedMeal({ payload: rec.payload }, 'u1')).toMatchObject({
      user_id: 'u1', name: 'Oats', servings: 2,
      items: [{ name: 'Oats', cal: 300, protein: 10, carbs: 50, fat: 6, servingGrams: 80 }],
    });
  });
});

describe('small formatters', () => {
  it('timeAgo', () => {
    const now = new Date('2026-10-06T12:00:00Z').getTime();
    const ago = (ms) => new Date(now - ms).toISOString();
    expect(timeAgo(ago(20e3), now)).toBe('Just now');
    expect(timeAgo(ago(5 * 60e3), now)).toBe('5m');
    expect(timeAgo(ago(2 * 3600e3), now)).toBe('2h');
    expect(timeAgo(ago(3 * 86400e3), now)).toBe('3d');
    expect(timeAgo(ago(20 * 86400e3), now)).toMatch(/Sept|Oct/);
  });
  it('initialsOf', () => {
    expect(initialsOf('Maya Kim')).toBe('MK');
    expect(initialsOf('alex')).toBe('A');
    expect(initialsOf('  ')).toBe('?');
  });
});
