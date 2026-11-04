import { describe, it, expect } from 'vitest';
import { nutrientReading, nutrientDetail, detailCoverage, DETAIL_GROUPS } from './foodDetails';
import { MICRO_KEYS } from './microNutrients';

describe('nutrientReading', () => {
  const food = { calcium: 120, iron: 0, thiamin: 0.25, selenium: null, fibre: 0, sodium: 340 };
  it('shows a food\'s own figure with its unit', () => {
    expect(nutrientReading(food, 'calcium')).toEqual({ kind: 'measured', text: '120mg' });
    expect(nutrientReading(food, 'thiamin')).toEqual({ kind: 'measured', text: '0.25mg' }); // small ones keep their precision
  });
  it('treats fibre, sodium and sugar as always known, even at zero', () => {
    expect(nutrientReading(food, 'fibre')).toEqual({ kind: 'measured', text: '0g' });
    expect(nutrientReading({ ...food }, 'sugar')).toEqual({ kind: 'measured', text: '0g' });
  });
  it('reads a stored 0 of an older nutrient as no data, but a real 0 of an extended one as a figure', () => {
    expect(nutrientReading(food, 'iron').kind).toBe('none');
    expect(nutrientReading({ ...food, thiamin: 0 }, 'thiamin')).toEqual({ kind: 'measured', text: '0mg' });
    expect(nutrientReading(food, 'selenium').kind).toBe('none');
  });
  it('uses an estimate, marked ~, only where the food has no figure', () => {
    const estimate = { micros: { iron: 2.46, calcium: 999, selenium: 12.4 } };
    expect(nutrientReading(food, 'iron', estimate)).toEqual({ kind: 'estimated', text: '~2.5mg' });
    expect(nutrientReading(food, 'selenium', estimate)).toEqual({ kind: 'estimated', text: '~12.4mcg' });
    expect(nutrientReading(food, 'calcium', estimate)).toEqual({ kind: 'measured', text: '120mg' }); // never overrides real data
  });
  it('says no data when the estimate has nothing for it either', () => {
    expect(nutrientReading(food, 'zinc', { micros: { zinc: 0 } }).kind).toBe('none');
    expect(nutrientReading(food, 'zinc', null).kind).toBe('none');
  });
});

describe('the details page layout', () => {
  it('lists every tracked nutrient exactly once', () => {
    const listed = DETAIL_GROUPS.flatMap((g) => g.keys);
    expect([...listed].sort()).toEqual([...MICRO_KEYS].sort());
  });
  it('gives each reading a value and its share of the daily target', () => {
    const food = { calcium: 500, iron: 0, thiamin: null };
    expect(nutrientDetail(food, 'calcium')).toMatchObject({ kind: 'measured', value: 500, pct: 50, via: null });
    expect(nutrientDetail(food, 'iron')).toMatchObject({ kind: 'none', value: null, pct: null });
    expect(nutrientDetail(food, 'thiamin', { micros: { thiamin: 0.575 }, via: 'ai' })).toMatchObject({ kind: 'estimated', value: 0.575, pct: 50, via: 'ai' });
    expect(nutrientDetail({ transFat: 1 }, 'transFat').pct).toBeNull(); // no target for it
  });
  it('counts what is measured, estimated and missing', () => {
    const c = detailCoverage({ calcium: 500, iron: 0 }, { micros: { iron: 3 } });
    expect(c.estimated).toBe(1);
    expect(c.measured + c.estimated + c.none).toBe(MICRO_KEYS.length);
  });
});
