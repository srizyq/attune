import { describe, it, expect } from 'vitest';
import {
  cleanTag, addTag, removeTag, allTags, suggestTags, prepLabel, parsePrepMinutes, isHighProtein, matchesFilter,
  filterRecipes, visibleBuiltIns, sortRecipes, featuredRecipe, MAX_TAGS, MAX_TAG_LENGTH,
} from './recipeTags';

const r = (name, over = {}) => ({ id: name, name, servings: 1, items: [{ cal: 400, protein: 20, carbs: 40, fat: 10 }], tags: [], favourite: false, prep_minutes: null, ...over });

describe('tags', () => {
  it('tidies what was typed and stops at the length the database allows', () => {
    expect(cleanTag('  pre   workout ')).toBe('pre workout');
    expect(cleanTag('x'.repeat(40))).toHaveLength(MAX_TAG_LENGTH);
    expect(cleanTag('   ')).toBe('');
    expect(cleanTag(null)).toBe('');
  });
  it('adds a tag once, whatever the capitals, up to the limit', () => {
    let t = addTag([], 'Dessert');
    expect(t).toEqual(['Dessert']);
    expect(addTag(t, ' dessert ')).toBe(t);           // same array back: nothing changed
    expect(addTag(t, '')).toBe(t);
    for (let i = 0; i < 20; i++) t = addTag(t, `t${i}`);
    expect(t).toHaveLength(MAX_TAGS);
  });
  it('removes a tag whatever its capitals', () => {
    expect(removeTag(['Dessert', 'Quick'], 'dessert')).toEqual(['Quick']);
  });
  it('lists everyone\'s tags most-used first, in the most-used spelling', () => {
    const recipes = [r('a', { tags: ['Dessert', 'quick'] }), r('b', { tags: ['dessert'] }), r('c', { tags: ['Dessert', 'Breakfast'] })];
    expect(allTags(recipes)).toEqual(['Dessert', 'Breakfast', 'quick']);
    expect(allTags([])).toEqual([]);
  });
  it('suggests their own tags while typing, skipping ones already on the recipe', () => {
    const all = ['Dessert', 'Breakfast', 'Pre-workout', 'Post-workout'];
    expect(suggestTags(all, ['Dessert'], '')).toEqual(['Breakfast', 'Pre-workout', 'Post-workout']);
    expect(suggestTags(all, [], 'pre')).toEqual(['Pre-workout']);
    expect(suggestTags(all, [], 'work')).toEqual(['Pre-workout', 'Post-workout']);   // contains, after starts-with
    expect(suggestTags(all, [], 'zzz')).toEqual([]);
  });
});

describe('prep time', () => {
  it('reads as a short label', () => {
    expect(prepLabel(10)).toBe('10m prep');
    expect(prepLabel(60)).toBe('1h prep');
    expect(prepLabel(65)).toBe('1h 5m prep');
    expect(prepLabel(null)).toBe('');
    expect(prepLabel(0)).toBe('');
  });
  it('parses what was typed', () => {
    expect(parsePrepMinutes('15')).toBe(15);
    expect(parsePrepMinutes(' 7.6 ')).toBe(8);
    expect(parsePrepMinutes('')).toBeNull();
    expect(parsePrepMinutes('abc')).toBeNull();
    expect(parsePrepMinutes('0')).toBeNull();
    expect(parsePrepMinutes('99999')).toBe(1440);
  });
});

describe('filters', () => {
  const pudding = r('Pudding', { tags: ['Dessert'], prep_minutes: 10, favourite: true });
  const steak = r('Steak', { items: [{ cal: 600, protein: 50, carbs: 5, fat: 30 }], prep_minutes: 40 });
  const rice = r('Rice');
  const all = [pudding, steak, rice];
  it('works out high protein from the numbers', () => {
    expect(isHighProtein(steak)).toBe(true);
    expect(isHighProtein(rice)).toBe(false);
    expect(isHighProtein(r('Shake', { items: [{ cal: 200, protein: 16, carbs: 10, fat: 2 }] }))).toBe(true);   // 16 g is 32% of 200 kcal
    expect(isHighProtein(r('Big', { servings: 4, items: [{ cal: 1600, protein: 80, carbs: 100, fat: 50 }] }))).toBe(false); // per serving: 20 g of 400
  });
  it('filters by built-ins and by their own tags', () => {
    expect(filterRecipes(all, { filter: 'favourites' })).toEqual([pudding]);
    expect(filterRecipes(all, { filter: 'high-protein' })).toEqual([steak]);
    expect(filterRecipes(all, { filter: 'quick' })).toEqual([pudding]);        // 10 min; no prep time never counts as quick
    expect(filterRecipes(all, { filter: 'dessert' })).toEqual([pudding]);
    expect(filterRecipes(all, { filter: 'all' })).toEqual(all);
    expect(matchesFilter(rice, undefined)).toBe(true);
  });
  it('searches names and tags', () => {
    expect(filterRecipes(all, { query: 'stea' })).toEqual([steak]);
    expect(filterRecipes(all, { query: 'desse' })).toEqual([pudding]);
    expect(filterRecipes(all, { query: 'nothing' })).toEqual([]);
  });
  it('only offers built-in chips that would match something', () => {
    expect(visibleBuiltIns([rice]).map((f) => f.id)).toEqual([]);
    expect(visibleBuiltIns(all).map((f) => f.id)).toEqual(['favourites', 'high-protein', 'quick']);
  });
});

describe('sorting and featured', () => {
  const a = r('Banana', { items: [{ cal: 100, protein: 1, carbs: 20, fat: 0 }] });
  const b = r('Apple', { items: [{ cal: 300, protein: 30, carbs: 20, fat: 0 }] });
  it('sorts', () => {
    expect(sortRecipes([a, b], 'recent')).toEqual([a, b]);
    expect(sortRecipes([a, b], 'name').map((x) => x.name)).toEqual(['Apple', 'Banana']);
    expect(sortRecipes([b, a], 'calories').map((x) => x.name)).toEqual(['Banana', 'Apple']);
    expect(sortRecipes([a, b], 'protein').map((x) => x.name)).toEqual(['Apple', 'Banana']);
  });
  it('features the recipe logged most recently', () => {
    const logs = [{ food_name: 'apple' }, { food_name: 'Banana' }];
    expect(featuredRecipe([a, b], logs)).toBe(b);
    expect(featuredRecipe([a, b], [{ food_name: 'Deleted recipe' }, { food_name: 'Banana' }])).toBe(a);
    expect(featuredRecipe([a, b], [])).toBeNull();
    expect(featuredRecipe([], logs)).toBeNull();
  });
});
