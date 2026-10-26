import { describe, it, expect } from 'vitest';
import { nutrientGaps, describeGaps, LIMIT_NUTRIENTS, LOW_BELOW_PCT } from './nutrientGaps.js';
import { MICRO_NUTRIENTS } from './microNutrients.js';

const totals = (over = {}) => ({ ...Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n.defaultTarget || 0])), ...over }); // everyone exactly on target

describe('nutrientGaps', () => {
  it('has nothing to say when every nutrient is on its target', () => {
    expect(nutrientGaps(totals())).toEqual({ low: [], high: [] });
  });

  it('names the nutrients well short of their targets, worst first', () => {
    const g = nutrientGaps(totals({ fibre: 7, calcium: 330, vitaminD: 6 }));
    expect(g.low.map((x) => [x.key, x.pct])).toEqual([['fibre', 25], ['calcium', 33], ['vitaminD', 40]]);
    expect(describeGaps(g.low)).toBe('Fibre 25% · Calcium 33% · Vitamin D 40%');
  });

  it('judges limits as limits: low sodium is fine, high sodium is not', () => {
    expect(nutrientGaps(totals({ sodium: 300 })).low.map((x) => x.key)).not.toContain('sodium');
    expect(nutrientGaps(totals({ sodium: 2700 })).high).toEqual([{ key: 'sodium', label: 'Sodium', pct: 117 }]);
    expect(nutrientGaps(totals({ sodium: 2300 })).high).toEqual([]); // exactly at the limit isn't over it
  });

  it('only counts a nutrient as low below the cut-off', () => {
    expect(LOW_BELOW_PCT).toBe(70);
    expect(nutrientGaps(totals({ fibre: 28 * 0.7 })).low.map((x) => x.key)).not.toContain('fibre'); // 70% exactly: fine
    expect(nutrientGaps(totals({ fibre: 28 * 0.69 })).low.map((x) => x.key)).toContain('fibre');
  });

  it('uses the coach\'s own target when there is one', () => {
    expect(nutrientGaps(totals({ fibre: 20 }), { fibre: 40 }).low[0]).toEqual({ key: 'fibre', label: 'Fibre', pct: 50 });
    expect(nutrientGaps(totals({ sodium: 1500 }), { sodium: 1000 }).high[0].pct).toBe(150);
  });

  it('skips extended nutrients when none of the day\'s foods carried them, rather than calling them 0%', () => {
    const none = { withData: 0, of: 3 };
    const t = totals({ thiamin: 0, selenium: 0 });
    expect(nutrientGaps(t, {}, none).low.map((x) => x.key)).not.toContain('thiamin');
    expect(nutrientGaps(t, {}, { withData: 2, of: 3 }).low.map((x) => x.key)).toContain('thiamin');
  });

  it('skips nutrients that have no target at all (trans fat, alcohol)', () => {
    const keys = [...nutrientGaps(totals({ transFat: 0, alcohol: 0, fibre: 0 })).low.map((x) => x.key)];
    expect(keys).toEqual(['fibre']);
  });

  it('shows at most three of each, and none from nothing', () => {
    const empty = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, 0]));
    expect(nutrientGaps(empty).low).toHaveLength(3);
    expect(nutrientGaps(null)).toBeNull();
  });

  it('every limit is a real nutrient whose guideline is a ceiling — and no other nutrient\'s is', () => {
    for (const key of LIMIT_NUTRIENTS) expect(MICRO_NUTRIENTS.find((n) => n.key === key)?.guideline, key).toMatch(/(under|up to)/i);
    for (const n of MICRO_NUTRIENTS) if (!LIMIT_NUTRIENTS.includes(n.key)) expect(n.guideline, n.key).not.toMatch(/Guideline: (under|up to)/i);
  });
});
