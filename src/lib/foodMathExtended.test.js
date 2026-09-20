import { describe, it, expect } from 'vitest';
import { scaleFood, sumFoodItems } from './foodMath';
import { EXTENDED_KEYS } from './microNutrients';

const base = { cal: 200, protein: 10, carbs: 20, fat: 5 };

describe('scaleFood with extended nutrients', () => {
  it('scales known values to two decimals (B vitamins are hundredths of a mg)', () => {
    const out = scaleFood({ ...base, thiamin: 0.04, iodine: 12.5, caffeine: 0 }, 2.5);
    expect(out.thiamin).toBe(0.1);
    expect(out.iodine).toBe(31.25);
    expect(out.caffeine).toBe(0);
  });

  it('keeps unknown as null — never turns it into a zero', () => {
    const out = scaleFood({ ...base, thiamin: null }, 3);
    for (const k of EXTENDED_KEYS) expect(out[k], k).toBeNull();
    expect(out.cal).toBe(600);
  });

  it('a food with no extended fields at all still works and gets nulls', () => {
    const out = scaleFood(base, 1);
    expect(out.selenium).toBeNull();
  });

  it('does not lose small values to one-decimal rounding', () => {
    expect(scaleFood({ ...base, thiamin: 0.04 }, 1).thiamin).toBe(0.04);
  });
});

describe('sumFoodItems with extended nutrients', () => {
  it('adds only the ingredients that have a value', () => {
    const t = sumFoodItems([{ ...base, thiamin: 0.2 }, { ...base, thiamin: null }, { ...base, thiamin: 0.3 }]);
    expect(t.thiamin).toBeCloseTo(0.5, 10);
  });

  it('a recipe none of whose ingredients carry a nutrient stays unknown', () => {
    const t = sumFoodItems([{ ...base }, { ...base, selenium: null }]);
    expect(t.selenium).toBeNull();
    expect(t.cal).toBe(400);
  });

  it('a measured zero is a value, not unknown', () => {
    expect(sumFoodItems([{ ...base, caffeine: 0 }]).caffeine).toBe(0);
  });

  it('flows through recipe -> per serving unchanged in meaning', () => {
    const per = scaleFood(sumFoodItems([{ ...base, thiamin: 0.2 }, { ...base, thiamin: 0.2 }]), 1 / 2);
    expect(per.thiamin).toBe(0.2);
    expect(scaleFood(sumFoodItems([{ ...base }]), 1).thiamin).toBeNull();
  });
});
