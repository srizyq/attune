import { describe, it, expect } from 'vitest';
import { rankFoods, basicTier, foodMatchRank } from './foodRank.js';

const f = (name, extra = {}) => ({ name, source: 'ausnut', ...extra });
const names = (foods, q) => rankFoods(foods, q).map((x) => x.name);

// Real names from the AUSNUT table, in the order the database returns them
// (shortest first), plus the kind of results the other sources add.
const POTATO = [
  f('Starch, potato'), f('Potato, dehydrated'), f('Potato, peeled, raw'), f('Potato, skin, baked'), f('Potato, unpeeled, raw'),
  f('Soup, potato, homemade'), f('Potato, mashed, dried powder'), f('Potato, red skin, peeled, raw'), f('Potato, purchased frozen, baked'),
  f('Sweet potato, boiled'), f('Potato pudding', { source: 'fatsecret' }), f('Baked potato', { source: 'fatsecret' }),
  f('Potato Gems', { source: 'restaurant-chain', brand: "McDonald's" }),
];

describe('rankFoods — the plain ingredient comes first', () => {
  it('potato: raw potato in the first three, never the pudding or starch', () => {
    const out = names(POTATO, 'potato');
    expect(out.slice(0, 3).every((n) => /raw/.test(n))).toBe(true);
    for (const bad of ['Potato pudding', 'Starch, potato', 'Soup, potato, homemade', 'Potato, dehydrated']) {
      expect(out.indexOf(bad)).toBeGreaterThan(out.indexOf('Potato, red skin, peeled, raw'));
    }
  });
  it('cooked simply comes after raw but before dishes and products', () => {
    const out = names(POTATO, 'potato');
    expect(out.indexOf('Potato, skin, baked')).toBeGreaterThan(out.indexOf('Potato, unpeeled, raw'));
    expect(out.indexOf('Potato, skin, baked')).toBeLessThan(out.indexOf('Potato pudding'));
    expect(out.indexOf('Potato, skin, baked')).toBeLessThan(out.indexOf('Potato Gems'));
  });
  it('chicken: raw cuts before sushi, bao buns and an egg', () => {
    const out = names([f('Sushi, chicken'), f('Bao bun, chicken'), f('Chicken, skin, raw'), f('Chicken, lean, raw'), f('Egg, chicken, scotch'), f('Chicken, liver, raw'), f('Egg, chicken, whole, raw')], 'chicken');
    expect(out.slice(0, 3).every((n) => /^chicken, .*raw$/i.test(n))).toBe(true);
    expect(out.slice(-3)).not.toContain('Chicken, lean, raw');
  });
  it('rice: uncooked and cooked rice before flour, syrup and curry', () => {
    const out = names([f('Flour, rice'), f('Syrup, rice malt'), f('Rice, white, cooked'), f('Rice, white, uncooked'), f('Curry, rice with fish'), f('Cauliflower rice, raw')], 'rice');
    expect(out.slice(0, 2)).toEqual(['Rice, white, uncooked', 'Rice, white, cooked']);
  });
  it('a plain generic name counts as the basic food', () => {
    const out = names([f('Banana split'), f('Banana', { source: 'fatsecret' }), f('Banana, cavendish, peeled, raw')], 'banana');
    expect(out[0]).toBe('Banana');
    expect(out.indexOf('Banana split')).toBe(2);
  });
  it('a word the person typed is not held against the result', () => {
    expect(basicTier(f('Potato chips, plain'), ['potato', 'chips'])).not.toBe(3);
    expect(basicTier(f('Potato, chips'), ['potato'])).toBe(3);
  });
});

describe('rankFoods — half-typed words', () => {
  it('pota behaves like potato', () => {
    const out = names(POTATO, 'pota');
    expect(out.slice(0, 3).every((n) => /raw/.test(n))).toBe(true);
  });
  it('chicken bre still finds the breast', () => {
    const out = names([f('Chicken, breast, lean, raw'), f('Chicken, thigh, raw'), f('Bao bun, chicken')], 'chicken bre');
    expect(out[0]).toBe('Chicken, breast, lean, raw');
  });
});

describe('rankFoods — my own foods and exact matches', () => {
  it('a saved food that matches goes above everything', () => {
    const out = names([f('Potato, peeled, raw'), f('My potato bake', { source: 'custom' })], 'potato');
    expect(out[0]).toBe('My potato bake');
  });
  it('a saved food that does not really match does not jump the queue', () => {
    const out = names([f('Potato, peeled, raw'), f('Roast dinner', { source: 'custom' })], 'potato');
    expect(out[0]).toBe('Potato, peeled, raw');
  });
  it('an exact match beats a longer raw name', () => {
    const out = names([f('Potato, peeled, raw'), f('Potato', { source: 'fatsecret' })], 'potato');
    expect(out[0]).toBe('Potato');
  });
  it('drops repeats of the same name and handles an empty query', () => {
    expect(names([f('Apple, raw'), f('apple, raw')], 'apple')).toHaveLength(1);
    expect(rankFoods([f('x')], '  ')).toHaveLength(1);
  });
  it('foodMatchRank keeps its four tiers', () => {
    expect(foodMatchRank('Potato', 'potato', ['potato'])).toBe(0);
    expect(foodMatchRank('Potato, raw', 'potato', ['potato'])).toBe(1);
    expect(foodMatchRank('Sweet potato', 'potato', ['potato'])).toBe(2);
    expect(foodMatchRank('Apple', 'potato', ['potato'])).toBe(3);
  });
});
