import { describe, it, expect } from 'vitest';
import {
  DAYS, MEALS, LIMITS, weekdayKey, newItem, cleanDays, validateMealPlan, mealTotals, dayTotals, planHasItems,
  recipeToItem, itemToFood, copyDay, groceryList, groceryText, loggedPlanMeals,
} from './mealPlan.js';

const it1 = (over = {}) => ({ name: 'Oats', label: '60g', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4, ...over });
const PLAN = { mon: { breakfast: [it1()], lunch: [it1({ name: 'Chicken salad', label: '1 bowl', calories: 480, protein_g: 40, carbs_g: 20, fat_g: 22 })] }, wed: { breakfast: [it1()] } };

describe('weekdayKey', () => {
  it('maps a calendar date to its weekday, Monday first', () => {
    expect(weekdayKey('2026-09-21')).toBe('mon');
    expect(weekdayKey('2026-09-20')).toBe('sun');
    expect(weekdayKey('2026-09-26')).toBe('sat');
    expect(DAYS.map(d => weekdayKey(`2026-09-${21 + DAYS.indexOf(d)}`))).toEqual(DAYS.map(d => d.key));
  });
  it('ignores a time suffix and returns null for garbage', () => {
    expect(weekdayKey('2026-09-21T23:59:59')).toBe('mon');
    expect(weekdayKey('nope')).toBeNull();
  });
});

describe('validateMealPlan (mirrors valid_meal_plan_days)', () => {
  it('accepts real, empty and partial plans', () => {
    expect(validateMealPlan(PLAN)).toBeNull();
    expect(validateMealPlan({})).toBeNull();
    expect(validateMealPlan({ tue: { lunch: [{ name: 'Just a name' }] } })).toBeNull();
  });
  it.each([
    [null, /malformed/], [[], /malformed/], [{ monday: {} }, /Unknown day/], [{ mon: [] }, /Monday is malformed/],
    [{ mon: { brunch: [] } }, /unknown meal/], [{ mon: { lunch: {} } }, /Lunch is malformed/],
    [{ mon: { lunch: ['x'] } }, /item 1 is malformed/], [{ mon: { lunch: [{ name: '  ' }] } }, /needs a name/],
    [{ mon: { lunch: [{ name: 'x'.repeat(121) }] } }, /name is too long/], [{ mon: { lunch: [it1({ label: 'y'.repeat(61) })] } }, /portion is too long/],
    [{ mon: { lunch: [it1({ calories: -1 })] } }, /calories must be between 0 and 5000/], [{ mon: { lunch: [it1({ protein_g: 1001 })] } }, /protein must be between/],
    [{ mon: { lunch: [it1({ calories: '200' })] } }, /calories must be/], [{ mon: { lunch: [it1({ calories: NaN })] } }, /calories must be/],
    [{ mon: { lunch: Array.from({ length: 21 }, () => it1()) } }, /at most 20 items/],
  ])('rejects %j', (plan, message) => {
    expect(validateMealPlan(plan)).toMatch(message);
  });
  it('names the day, meal and item at fault', () => {
    expect(validateMealPlan({ thu: { dinner: [it1(), { name: '' }] } })).toBe('Thursday Dinner, item 2 needs a name.');
  });
  it('agrees with the limits it advertises', () => {
    expect(validateMealPlan({ mon: { lunch: [it1({ calories: LIMITS.calories, protein_g: LIMITS.macro })] } })).toBeNull();
    expect(validateMealPlan({ mon: { lunch: Array.from({ length: LIMITS.items }, () => it1()) } })).toBeNull();
  });
});

describe('cleanDays', () => {
  it('trims, rounds, clamps and drops empties — and the result always validates', () => {
    const cleaned = cleanDays({
      mon: { breakfast: [newItem({ name: '  Eggs ', label: ' 2 large ', calories: 143.6, protein_g: 12.345, carbs_g: -3, fat_g: 99999 }), newItem({ name: 'Toast', label: '   ' })], lunch: [] },
      tue: {},
    });
    expect(cleaned).toEqual({ mon: { breakfast: [
      { name: 'Eggs', label: '2 large', calories: 144, protein_g: 12.3, carbs_g: 0, fat_g: 1000 },
      { name: 'Toast', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    ] } });
    expect(validateMealPlan(cleaned)).toBeNull();
  });
  it('tolerates junk input', () => {
    expect(cleanDays(undefined)).toEqual({});
    expect(cleanDays({ mon: { breakfast: [{ name: 'x', calories: 'abc' }] } }).mon.breakfast[0].calories).toBe(0);
  });
  it('leaves an unnamed item in so validation can tell the coach, rather than silently dropping it', () => {
    expect(validateMealPlan(cleanDays({ mon: { lunch: [newItem()] } }))).toMatch(/needs a name/);
  });
});

describe('totals', () => {
  it('sums a meal, a day, and copes with empties', () => {
    expect(mealTotals([it1(), it1({ calories: 100.4, protein_g: 1.26 })])).toEqual({ calories: 320, protein_g: 9.3, carbs_g: 76, fat_g: 8 });
    expect(dayTotals(PLAN.mon)).toEqual({ calories: 700, protein_g: 48, carbs_g: 58, fat_g: 26 });
    expect(dayTotals(undefined)).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(mealTotals(undefined).calories).toBe(0);
  });
  it('knows whether a plan has anything in it', () => {
    expect(planHasItems(PLAN)).toBe(true);
    expect(planHasItems({})).toBe(false);
    expect(planHasItems({ mon: { lunch: [] } })).toBe(false);
  });
});

describe('recipeToItem', () => {
  it('uses the per-serving totals of a saved recipe', () => {
    const item = recipeToItem({ name: 'Chilli', servings: 4, items: [{ cal: 800, protein: 60, carbs: 80, fat: 20 }, { cal: 400, protein: 20, carbs: 40, fat: 10 }] });
    expect(item).toEqual({ name: 'Chilli', label: '1 serving', calories: 300, protein_g: 20, carbs_g: 30, fat_g: 7.5 });
    expect(validateMealPlan({ mon: { lunch: [item] } })).toBeNull();
  });
  it('copes with an empty recipe, zero servings, and an over-long name', () => {
    expect(recipeToItem({ name: 'Nothing', items: [] }).calories).toBe(0);
    expect(recipeToItem({ name: 'x', servings: 0, items: [{ cal: 100 }] }).calories).toBe(100);
    expect(recipeToItem({ name: 'n'.repeat(300), items: [] }).name).toHaveLength(LIMITS.name);
  });
});

describe('itemToFood', () => {
  it('produces a food-log entry tagged as coming from the plan', () => {
    expect(itemToFood(it1())).toEqual({ name: 'Oats', cal: 220, protein: 8, carbs: 38, fat: 4, servingLabel: '60g', source: 'plan' });
    expect(itemToFood({ name: 'Bare' })).toEqual({ name: 'Bare', cal: 0, protein: 0, carbs: 0, fat: 0, servingLabel: null, source: 'plan' });
  });
});

describe('copyDay', () => {
  it('copies a day onto others without sharing references', () => {
    const next = copyDay(PLAN, 'mon', ['tue', 'thu']);
    expect(next.tue).toEqual(PLAN.mon);
    next.tue.breakfast[0].name = 'Changed';
    expect(next.thu.breakfast[0].name).toBe('Oats');
    expect(PLAN.mon.breakfast[0].name).toBe('Oats');
    expect(PLAN.tue).toBeUndefined();
  });
  it('overwrites the target, ignores copying a day onto itself, and clears targets when the source is empty', () => {
    expect(copyDay(PLAN, 'mon', ['wed']).wed).toEqual(PLAN.mon);
    expect(copyDay(PLAN, 'mon', ['mon']).mon).toBe(PLAN.mon);
    expect(copyDay(PLAN, 'fri', ['mon']).mon).toBeUndefined();
  });
});

describe('groceryList', () => {
  const plan = { mon: { breakfast: [it1()], dinner: [it1({ name: 'Salmon', label: '150g' })] }, tue: { breakfast: [it1({ name: 'oats ', label: '60G' })] }, wed: { breakfast: [it1({ label: '80g' })] } };
  it('groups repeats case-insensitively and counts them; different portions stay separate', () => {
    expect(groceryList(plan).map(g => [g.name, g.label, g.count])).toEqual([['Oats', '60g', 2], ['Oats', '80g', 1], ['Salmon', '150g', 1]]);
  });
  it('can be limited to some days', () => {
    expect(groceryList(plan, { onlyDays: ['mon'] }).map(g => g.name)).toEqual(['Oats', 'Salmon']);
    expect(groceryList(plan, { onlyDays: [] })).toEqual([]);
  });
  it('skips nameless items and handles an empty plan', () => {
    expect(groceryList({ mon: { lunch: [{ name: '  ' }, { label: 'x' }] } })).toEqual([]);
    expect(groceryList({})).toEqual([]);
    expect(groceryList(undefined)).toEqual([]);
  });
  it('prints as a plain list', () => {
    expect(groceryText(groceryList(plan))).toBe('• Oats (60g) ×2\n• Oats (80g)\n• Salmon (150g)');
    expect(groceryText([{ name: 'Rice', label: '', count: 1 }])).toBe('• Rice');
  });
});

describe('the constants line up with the database', () => {
  it('has all seven days and four meals under the keys the SQL allows', () => {
    expect(DAYS.map(d => d.key)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(MEALS.map(m => m.key)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });
});

describe('loggedPlanMeals', () => {
  const day = { breakfast: [it1({ name: 'Oats' }), it1({ name: 'Banana' })], lunch: [it1({ name: 'Salad' })], dinner: [] };
  const log = (meal, name, source = 'plan') => ({ meal, name, source });

  it('marks a meal once every planned item is logged from the plan', () => {
    expect([...loggedPlanMeals(day, [log('breakfast', 'Oats')])]).toEqual([]);
    expect([...loggedPlanMeals(day, [log('breakfast', 'Oats'), log('breakfast', 'Banana')])]).toEqual(['breakfast']);
    expect([...loggedPlanMeals(day, [log('breakfast', 'Oats'), log('breakfast', 'Banana'), log('lunch', 'Salad')])].sort()).toEqual(['breakfast', 'lunch']);
  });
  it('matches names loosely on case and spacing', () => {
    expect([...loggedPlanMeals(day, [log('lunch', ' salad ')])]).toEqual(['lunch']);
  });
  it('does not count food logged some other way, or under a different meal', () => {
    expect([...loggedPlanMeals(day, [log('lunch', 'Salad', 'fatsecret')])]).toEqual([]);
    expect([...loggedPlanMeals(day, [log('dinner', 'Salad')])]).toEqual([]);
  });
  it('matches one-for-one, so two identical planned items need two logs', () => {
    const twice = { snacks: [it1({ name: 'Apple' }), it1({ name: 'Apple' })] };
    expect([...loggedPlanMeals(twice, [log('snacks', 'Apple')])]).toEqual([]);
    expect([...loggedPlanMeals(twice, [log('snacks', 'Apple'), log('snacks', 'Apple')])]).toEqual(['snacks']);
  });
  it('ignores empty meals and copes with no logs or no day', () => {
    expect([...loggedPlanMeals(day, [])]).toEqual([]);
    expect([...loggedPlanMeals(undefined, undefined)]).toEqual([]);
    expect(loggedPlanMeals(day, [log('dinner', 'x')]).has('dinner')).toBe(false);
  });
});
