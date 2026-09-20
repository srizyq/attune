import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MICRO_NUTRIENTS, MICRO_KEYS, MICRO_COLUMNS, EXTENDED_NUTRIENTS, EXTENDED_KEYS,
  extendedFromRow, extendedToRow, extendedCoverage, extendedSummary, extendedNote, formatMicro, lateFavouriteToRow, FAVOURITE_LATE_KEYS,
} from './microNutrients';
import { MICRO_GROUPS } from '../components/coach/constants';

describe('the registry', () => {
  it('has 32 nutrients, unique keys and unique columns', () => {
    expect(MICRO_NUTRIENTS).toHaveLength(32);
    expect(new Set(MICRO_KEYS).size).toBe(32);
    expect(new Set(Object.values(MICRO_COLUMNS)).size).toBe(32);
  });

  it('gives every nutrient a column, unit, label, icon and colour', () => {
    for (const n of MICRO_NUTRIENTS) {
      expect(n.column, n.key).toMatch(/^[a-z0-9_]+_(g|mg|mcg)$/);
      expect(['g', 'mg', 'mcg']).toContain(n.unit);
      expect(n.label && n.icon && n.color && n.guideline, n.key).toBeTruthy();
      if (n.defaultTarget !== undefined) expect(n.defaultTarget).toBeGreaterThan(0);
    }
  });

  it('the column suffix agrees with the unit (a mismatch would silently mis-scale)', () => {
    for (const n of MICRO_NUTRIENTS) expect(n.column.endsWith(`_${n.unit}`), `${n.key}: ${n.column} vs ${n.unit}`).toBe(true);
  });

  it('marks exactly the 13 newer nutrients as extended', () => {
    expect(EXTENDED_KEYS).toEqual(['thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'vitaminE', 'phosphorus', 'selenium', 'iodine', 'omega3', 'omega6', 'alphaLinolenicAcid', 'caffeine', 'alcohol']);
    expect(MICRO_NUTRIENTS.filter((n) => n.extended)).toEqual(EXTENDED_NUTRIENTS);
  });

  it('every nutrient sits in exactly one coach display group, and only extended ones in extended groups', () => {
    const grouped = MICRO_GROUPS.flatMap((g) => g.keys);
    expect(grouped.slice().sort()).toEqual(MICRO_KEYS.slice().sort());
    for (const g of MICRO_GROUPS) for (const k of g.keys) expect(!!g.extended, `${g.label}/${k}`).toBe(EXTENDED_KEYS.includes(k));
  });

  it('every column exists in schema.sql for food_logs (drift guard for the SQL)', () => {
    const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
    for (const n of MICRO_NUTRIENTS) expect(sql, `${n.column} on food_logs`).toMatch(new RegExp(`(^|\\s)${n.column}\\s+numeric|food_logs add column if not exists ${n.column}\\b`, 'm'));
  });
});

describe('extendedFromRow / extendedToRow', () => {
  it('keeps NULL as null and a measured zero as 0', () => {
    const got = extendedFromRow({ thiamin_mg: '0.25', caffeine_mg: 0, selenium_mcg: null });
    expect(got.thiamin).toBe(0.25);
    expect(got.caffeine).toBe(0);
    expect(got.selenium).toBeNull();
    expect(got.iodine).toBeNull(); // column absent entirely (old database)
    expect(Object.keys(got)).toEqual(EXTENDED_KEYS);
  });

  it('never invents a value from junk', () => {
    const got = extendedFromRow({ thiamin_mg: '', niacin_mg: 'abc', selenium_mcg: undefined });
    expect(got.thiamin).toBeNull();
    expect(got.niacin).toBeNull();
    expect(got.selenium).toBeNull();
  });

  it('writes only nutrients that have a value — so a food with none adds no columns at all', () => {
    expect(extendedToRow({ name: 'Toast', thiamin: null, caffeine: undefined })).toEqual({});
    expect(extendedToRow({ thiamin: 0.25, caffeine: 0, selenium: null, iodine: '12' })).toEqual({ thiamin_mg: 0.25, caffeine_mg: 0, iodine_mcg: 12 });
    expect(extendedToRow(null)).toEqual({});
  });

  it('round-trips', () => {
    const food = { thiamin: 0.13, omega3: 220, alcohol: 0 };
    expect(extendedFromRow(extendedToRow(food))).toMatchObject(food);
  });
});

describe('extendedCoverage / extendedSummary / extendedNote', () => {
  const items = [{ thiamin: 0.2, caffeine: 95 }, { thiamin: 0.3, caffeine: null }, { thiamin: null }, {}];

  it('sums only the foods that have data and counts them', () => {
    const c = extendedCoverage(items);
    expect(c.thiamin).toEqual({ total: 0.5, withData: 2, of: 4 });
    expect(c.caffeine).toEqual({ total: 95, withData: 1, of: 4 });
    expect(c.selenium).toEqual({ total: 0, withData: 0, of: 4 });
  });

  it('handles no items', () => {
    expect(extendedCoverage(undefined).thiamin).toEqual({ total: 0, withData: 0, of: 0 });
    expect(extendedSummary([])).toEqual({ withData: 0, of: 0 });
  });

  it('counts a food once however many extended nutrients it carries', () => {
    expect(extendedSummary(items)).toEqual({ withData: 2, of: 4 });
  });

  it('says what it knows, and stays silent when nothing is logged', () => {
    expect(extendedNote({ withData: 0, of: 0 })).toBeNull();
    expect(extendedNote({ withData: 0, of: 3 })).toMatch(/None of the foods/);
    expect(extendedNote({ withData: 2, of: 5 })).toMatch(/Based on 2 of 5 foods.*minimum/);
  });
});

describe('formatMicro', () => {
  const by = (k) => MICRO_NUTRIENTS.find((n) => n.key === k);
  it('keeps the precision each kind of nutrient needs', () => {
    expect(formatMicro(by('thiamin'), 0.137)).toBe(0.14); // would be 0.1 at one decimal
    expect(formatMicro(by('fibre'), 12.34)).toBe(12.3);
    expect(formatMicro(by('folate'), 212.6)).toBe(213);
  });
  it('treats missing / junk as 0', () => {
    expect(formatMicro(by('iron'), null)).toBe(0);
    expect(formatMicro(by('iron'), 'x')).toBe(0);
  });
});

describe('lateFavouriteToRow', () => {
  it('sends non-zero late older nutrients and the extended ones a food has, nothing else', () => {
    expect(lateFavouriteToRow({ vitaminA: 120, zinc: 2.5, folate: 0, thiamin: 0.25, caffeine: 0, selenium: null, calcium: 40, fibre: 3 }))
      .toEqual({ vitamin_a_mcg: 120, zinc_mg: 2.5, thiamin_mg: 0.25, caffeine_mg: 0 });
  });
  it('is empty for a food with none of them — so an un-updated database sees no new column', () => {
    expect(lateFavouriteToRow({ name: 'Toast', calcium: 20 })).toEqual({});
    expect(lateFavouriteToRow(null)).toEqual({});
    expect(lateFavouriteToRow({ vitaminA: NaN, zinc: 'x' })).toEqual({});
  });
  it('covers exactly the eight older nutrients favourites originally lacked', () => {
    expect(FAVOURITE_LATE_KEYS).toHaveLength(8);
    for (const k of FAVOURITE_LATE_KEYS) expect(MICRO_KEYS).toContain(k);
  });
});

