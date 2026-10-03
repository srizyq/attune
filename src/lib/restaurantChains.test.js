import { describe, it, expect } from 'vitest';
import { matchChains, normalizeChainText, groupByCategory, CHAIN_ALIASES } from './restaurantChains';

const chains = [
  { id: 'mcdonalds-au', name: "McDonald's" },
  { id: 'hungry-jacks-au', name: "Hungry Jack's" },
  { id: 'kfc-au', name: 'KFC' },
  { id: 'chicken-treat-au', name: 'Chicken Treat' },
  { id: 'baskin-robbins-au', name: 'Baskin-Robbins' },
  { id: 'guzman-y-gomez-au', name: 'Guzman y Gomez' },
  { id: 'subway-au', name: 'Subway' },
  { id: 'starbucks-au', name: 'Starbucks' },
];
const ids = (q) => matchChains(q, chains).map((c) => c.id);

describe('normalizeChainText', () => {
  it('drops apostrophes and turns other symbols into spaces', () => {
    expect(normalizeChainText("Macca's")).toBe('maccas');
    expect(normalizeChainText('Baskin-Robbins')).toBe('baskin robbins');
    expect(normalizeChainText('  Guzman  y  Gomez ')).toBe('guzman y gomez');
  });
});

describe('matchChains', () => {
  it('finds a chain by its name however it is punctuated', () => {
    for (const q of ['mcdonalds', "mcdonald's", 'McDonalds', 'mcdonald']) expect(ids(q)).toEqual(['mcdonalds-au']);
  });
  it('finds a chain by an Aussie nickname', () => {
    expect(ids('maccas')).toEqual(['mcdonalds-au']);
    expect(ids("macca's")).toEqual(['mcdonalds-au']);
    expect(ids('hjs')).toEqual(['hungry-jacks-au']);
    expect(ids('gyg')).toEqual(['guzman-y-gomez-au']);
    expect(ids('kentucky fried chicken')).toEqual(['kfc-au']);
  });
  it('matches the start of a name while typing, but not before three characters', () => {
    expect(ids('mcd')).toEqual(['mcdonalds-au']);
    expect(ids('sta')).toEqual(['starbucks-au']);
    expect(ids('mc')).toEqual([]);
  });
  it('finds the chain inside a longer query like "maccas big mac"', () => {
    expect(ids('maccas big mac')).toEqual(['mcdonalds-au']);
    expect(ids('big mac mcdonalds')).toEqual(['mcdonalds-au']);
  });
  it('matches a later word of a name (hungry -> Hungry Jack\'s, treat -> Chicken Treat)', () => {
    expect(ids('treat')).toEqual(['chicken-treat-au']);
    expect(ids('robbins')).toEqual(['baskin-robbins-au']);
  });
  it('does not match through the middle of a nickname ("chicken" is not KFC)', () => {
    expect(ids('chicken')).toEqual(['chicken-treat-au']);
  });
  it('does not match unrelated food searches', () => {
    for (const q of ['big mac', 'chicken breast', 'apple', 'rice']) expect(ids(q)).not.toContain('mcdonalds-au');
    expect(ids('apple')).toEqual([]);
  });
  it('ranks an exact name above a prefix match', () => {
    const list = [{ id: 'a', name: 'Subway Express' }, { id: 'subway-au', name: 'Subway' }];
    expect(matchChains('subway', list).map((c) => c.id)).toEqual(['subway-au', 'a']);
  });
  it('caps how many cards it offers', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, name: `Coffee Shop ${i}` }));
    expect(matchChains('coffee', many)).toHaveLength(3);
    expect(matchChains('coffee', many, 5)).toHaveLength(5);
  });
  it('is safe with no query, no chains, or a non-array', () => {
    expect(matchChains('', chains)).toEqual([]);
    expect(matchChains('maccas', [])).toEqual([]);
    expect(matchChains('maccas', null)).toEqual([]);
  });
});

describe('aliases', () => {
  it('are only defined for chains that exist in the data', () => {
    expect(Object.keys(CHAIN_ALIASES).length).toBeGreaterThan(20);
    for (const aliases of Object.values(CHAIN_ALIASES)) for (const a of aliases) expect(normalizeChainText(a)).toBe(a);
  });
});

describe('groupByCategory', () => {
  it('groups items, categories A-Z, uncategorised last', () => {
    const out = groupByCategory([{ name: 'a', category: 'Burgers' }, { name: 'b' }, { name: 'c', category: 'Breakfast' }, { name: 'd', category: 'Burgers' }]);
    expect(out.map((g) => [g.category, g.items.length])).toEqual([['Breakfast', 1], ['Burgers', 2], ['Other', 1]]);
  });
  it('is empty for no items', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
