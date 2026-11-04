import { describe, it, expect } from 'vitest';
import { nutrientsFromForm, supplementToFood, supplementSummary, isSupplement, SUPPLEMENT_FIELDS } from './supplements.js';
import { MICRO_KEYS } from './microNutrients.js';
import { contributorsFor } from './nutrientContributors.js';

describe('supplements', () => {
  it('keeps only positive amounts of nutrients the app knows', () => {
    expect(nutrientsFromForm({ vitaminD: '25', vitaminC: '', iron: '0', zinc: '-3', bogus: '5', calcium: 'abc', magnesium: '120.5' })).toEqual({ vitaminD: 25, magnesium: 120.5 });
  });
  it('turns a saved supplement into a 0 kcal food carrying its nutrients', () => {
    const food = supplementToFood({ name: 'Multi', serving_label: '1 tablet', nutrients: { vitaminD: 25, vitaminK: 80, bogus: 1 } });
    expect(food).toMatchObject({ name: 'Multi', cal: 0, source: 'supplement', servingLabel: '1 tablet', vitaminD: 25, vitaminK: 80 });
    expect('bogus' in food).toBe(false);
    expect(isSupplement({ source: 'supplement' })).toBe(true);
    expect(isSupplement({ source: 'off' })).toBe(false);
  });
  it('summarises what it contains', () => {
    expect(supplementSummary({ nutrients: { vitaminD: 25, vitaminC: 500 } })).toBe('Vitamin D 25mcg · Vitamin C 500mg');
    expect(supplementSummary({ nutrients: { vitaminD: 25, vitaminC: 500, iron: 8, zinc: 5 } })).toBe('Vitamin D 25mcg · Vitamin C 500mg · Iron 8mg · +1 more');
  });
  it('the form only offers real nutrients', () => {
    for (const g of SUPPLEMENT_FIELDS) for (const k of g.keys) expect(MICRO_KEYS).toContain(k);
  });
  it('a supplement counts as measured: what it does not list is none, not unknown', () => {
    const items = [{ id: 's', name: 'Vit D', source: 'supplement', cal: 0, vitaminD: 25, calcium: 0 }];
    const d = contributorsFor('vitaminD', items, new Map());
    expect(d.rows[0]).toMatchObject({ name: 'Vit D', kind: 'measured', amount: 25 });
    const c = contributorsFor('calcium', items, new Map());
    expect(c.unknown).toEqual([]);
    expect(c.none).toHaveLength(1);
  });
});
