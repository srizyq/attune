import { describe, it, expect } from 'vitest';
import { microsFromOFF } from './offNutrients.js';

// Open Food Facts reports per 100 g, in grams.
const PRODUCT = {
  'saturated-fat_100g': 3.2, calcium_100g: 0.12, iron_100g: 0.0021, potassium_100g: 0.35,
  'vitamin-c_100g': 0.0053, 'vitamin-a_100g': 0.0008, 'vitamin-b12_100g': 0.0000004, 'vitamin-b9_100g': 0.00006,
  magnesium_100g: 0.04, zinc_100g: 0.0011, 'vitamin-b1_100g': 0.00035, selenium_100g: 0.000012, 'omega-3-fat_100g': 0.25,
};

describe('microsFromOFF', () => {
  it('converts grams to the units the diary stores, scaled by the portion', () => {
    const m = microsFromOFF(PRODUCT, 1);
    expect(m).toMatchObject({ saturatedFat: 3.2, calcium: 120, iron: 2.1, potassium: 350, vitaminC: 5.3, vitaminA: 800, vitaminB12: 0.4, folate: 60, magnesium: 40, zinc: 1.1 });
    expect(microsFromOFF(PRODUCT, 0.5).calcium).toBe(60); // half a 100 g serving
  });

  it('reads the extended nutrients too', () => {
    const m = microsFromOFF(PRODUCT, 1);
    expect(m.thiamin).toBe(0.35);
    expect(m.selenium).toBe(12);
    expect(m.omega3).toBe(250);
  });

  it('the original nutrients read 0 when absent, the extended ones stay unknown (not 0)', () => {
    const m = microsFromOFF({ calcium_100g: 0.1 }, 1);
    expect(m.vitaminC).toBe(0);
    expect(m.magnesium).toBe(0);
    expect('thiamin' in m).toBe(false);
    expect('selenium' in m).toBe(false);
  });

  it('a measured zero stays a zero for the extended nutrients', () => {
    expect(microsFromOFF({ 'vitamin-b1_100g': 0 }, 1).thiamin).toBe(0);
  });

  it('ignores junk values and accepts the older folate field name', () => {
    const m = microsFromOFF({ calcium_100g: 'abc', iron_100g: -1, folates_100g: 0.0001 }, 1);
    expect(m.calcium).toBe(0);
    expect(m.iron).toBe(0);
    expect(m.folate).toBe(100);
    expect(microsFromOFF(undefined, 1).calcium).toBe(0);
  });
});
