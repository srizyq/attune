import { describe, it, expect, vi } from 'vitest';
import {
  missingKeys, hasData, nameTokens, candidateQueries, per100Micros, portionFactor,
  estimateItem, estimateItems, estimateSummary, microNote, cachedSearch, ESTIMATE_KEYS,
} from './microEstimate.js';

const YOGHURT = { id: 'a1', name: 'Yoghurt, Greek style, plain', calories: 100, calcium_mg: 120, vitamin_c_mg: 1, magnesium_mg: 11, zinc_mg: 0.5, vitamin_b12_mcg: 0.5, thiamin_mg: 0.04 };
const CHICKEN = { id: 'a2', name: 'Chicken, breast, grilled', calories: 165, calcium_mg: 10, vitamin_c_mg: 0, magnesium_mg: 28, zinc_mg: 1, vitamin_b12_mcg: 0.3, thiamin_mg: 0.07 };
const rows = { 'greek yoghurt': [YOGHURT], 'chicken breast': [CHICKEN], curry: [] };
const search = vi.fn(async (q) => rows[q] || []);

describe('what a logged item is missing', () => {
  it('reads 0 as no data for the original nutrients and null for the extended ones', () => {
    const item = { calcium: 80, iron: 0, thiamin: null, selenium: 0 };
    expect(hasData(item, 'calcium')).toBe(true);
    expect(hasData(item, 'iron')).toBe(false);
    expect(hasData(item, 'thiamin')).toBe(false);
    expect(hasData(item, 'selenium')).toBe(true); // a measured zero
    const missing = missingKeys(item);
    expect(missing).toContain('iron');
    expect(missing).toContain('thiamin');
    expect(missing).not.toContain('calcium');
    expect(missing).not.toContain('selenium');
    // fibre, sodium and sugar come with every source, so are never estimated
    expect(missing).not.toContain('fibre');
  });
});

describe('searching by name', () => {
  it('drops the brand, sizes and filler words', () => {
    expect(nameTokens('Chobani Greek Yoghurt (170g)', 'Chobani')).toEqual(['greek', 'yoghurt']);
    expect(nameTokens('Grilled chicken breast with rice')).toEqual(['grilled', 'chicken', 'breast', 'rice']);
  });
  it('tries the last words first, since a brand leads the name', () => {
    expect(candidateQueries(['chobani', 'greek', 'yoghurt'])).toEqual(['chobani greek yoghurt', 'greek yoghurt']);
    expect(candidateQueries(['greek', 'yoghurt'])).toEqual(['greek yoghurt']);
    expect(candidateQueries(['banana'])).toEqual(['banana']);
    expect(candidateQueries([])).toEqual([]);
  });
  it('never searches on one vague word alone', () => {
    expect(candidateQueries(['powder'])).toEqual([]);
    expect(candidateQueries(nameTokens('Protein bar'))).toEqual([]);
  });
});

describe('scaling to the portion', () => {
  it('uses the weight when known', () => {
    expect(portionFactor({ grams: 170, cal: 170 }, { calories: 100 })).toBe(1.7);
  });
  it('uses calories when the weight is unknown', () => {
    expect(portionFactor({ grams: null, cal: 200 }, { calories: 100 })).toBe(2);
  });
  it('falls back to calories when weight and calories disagree badly', () => {
    // 300 g of something 100 kcal/100 g would be 300 kcal, but only 90 were logged
    expect(portionFactor({ grams: 300, cal: 90 }, { calories: 100 })).toBe(0.9);
  });
  it('gives up when neither works', () => {
    expect(portionFactor({ grams: null, cal: 0 }, { calories: 100 })).toBeNull();
  });
  it('per-100 g nutrients keep unknown extended values as null', () => {
    const p = per100Micros({ calcium_mg: 50, thiamin_mg: null });
    expect(p.calcium).toBe(50);
    expect(p.thiamin).toBeNull();
    expect(p.zinc).toBe(0);
  });
});

describe('estimating an item', () => {
  it('fills only what the item is missing, scaled to its weight', async () => {
    const item = { id: 'i1', name: 'Chobani Greek Yoghurt', brand: 'Chobani', cal: 170, servingGrams: 170, calcium: 90 };
    const est = await estimateItem(item, search);
    expect(est.from).toEqual(['Yoghurt, Greek style, plain']);
    expect(est.micros.magnesium).toBe(18.7);   // 11 per 100 g x 1.7
    expect(est.micros.zinc).toBe(0.85);
    expect(est.micros.thiamin).toBe(0.068);
    expect('calcium' in est.micros).toBe(false); // the item already had calcium
  });

  it('a scanned meal is estimated ingredient by ingredient and summed', async () => {
    const item = {
      id: 'i2', name: 'Chicken and rice', cal: 400, servingGrams: 300,
      ingredients: [{ name: 'Grilled chicken breast', grams: 100, cal: 165 }, { name: 'Mystery curry', grams: 200, cal: 235 }],
    };
    const est = await estimateItem(item, search);
    expect(est.from).toEqual(['Chicken, breast, grilled']); // curry had no match, so it adds nothing
    expect(est.micros.magnesium).toBe(28);
  });

  it('returns null when nothing similar exists, or nothing is missing', async () => {
    expect(await estimateItem({ id: 'x', name: 'Mystery curry', cal: 300, servingGrams: 100 }, search)).toBeNull();
    const full = Object.fromEntries(ESTIMATE_KEYS.map((k) => [k, 1]));
    expect(await estimateItem({ id: 'y', name: 'Greek yoghurt', cal: 100, ...full }, search)).toBeNull();
  });
});

describe('estimating a day', () => {
  it('estimates every item that needs it and survives a failing lookup', async () => {
    const flaky = vi.fn(async (q) => { if (q === 'chicken breast') throw new Error('network'); return rows[q] || []; });
    const items = [
      { id: 'a', name: 'Greek yoghurt', cal: 100, servingGrams: 100 },
      { id: 'b', name: 'Grilled chicken breast', cal: 165, servingGrams: 100 },
      { id: 'c', name: 'Water', cal: 0 },
    ];
    const out = await estimateItems(items, flaky);
    expect([...out.keys()]).toEqual(['a']);
  });

  it('a cached search asks once per query', async () => {
    const inner = vi.fn(async () => []);
    const cached = cachedSearch(inner);
    await cached('Greek yoghurt'); await cached('greek yoghurt');
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('what the cards say', () => {
  const items = [
    { id: '1', name: 'A', cal: 100, calcium: 50 },
    { id: '2', name: 'B', cal: 100, calcium: 0 },
    { id: '3', name: 'C', cal: 100, calcium: 0 },
  ];
  const estimates = new Map([['2', { micros: { calcium: 30, magnesium: 20 }, from: ['x'] }]]);
  const summary = estimateSummary(items, estimates);

  it('counts measured and estimated foods per nutrient', () => {
    expect(summary.perKey.calcium).toEqual({ measured: 1, estimated: 1, estTotal: 30 });
    expect(summary.perKey.magnesium).toEqual({ measured: 0, estimated: 1, estTotal: 20 });
    expect(summary.estimatedItems).toBe(1);
  });
  it('says how much was measured, how much estimated, or that there is no data', () => {
    expect(microNote(summary, 'calcium')).toEqual({ note: 'Data for 1 of 3 foods · estimates for 1 more', noData: false, approx: true });
    expect(microNote(summary, 'magnesium').note).toBe('Estimated from similar foods (1 of 3)');
    expect(microNote(summary, 'zinc')).toEqual({ note: 'No data in the foods logged', noData: true, approx: false });
    expect(microNote(estimateSummary([{ id: 'z', cal: 1, calcium: 5 }], new Map()), 'calcium')).toEqual({ note: null, noData: false, approx: false });
    expect(microNote(estimateSummary([], new Map()), 'calcium').noData).toBe(false); // a day with nothing logged
  });
});
