import { describe, it, expect } from 'vitest';
import { ausnutExtraMicros } from './ausnutFood';
import { EXTENDED_KEYS } from './microNutrients';

describe('ausnutExtraMicros', () => {
  it('maps the nutrients AUSNUT foods used to log as zero, with the app\'s usual rounding', () => {
    const got = ausnutExtraMicros({ saturated_fat_g: 3.26, trans_fat_g: 0.0098, cholesterol_mg: 41.6, potassium_mg: 150.4, added_sugar_g: 2.04, vitamin_d_mcg: 1.26, calcium_mg: 120.5, iron_mg: 0.84 });
    expect(got).toMatchObject({ saturatedFat: 3.3, transFat: 0, cholesterol: 42, potassium: 150, addedSugar: 2, vitaminD: 1.3, calcium: 121, iron: 0.8 });
  });

  it('carries the extended nutrients through, keeping NULL as null', () => {
    const got = ausnutExtraMicros({ thiamin_mg: 0.013, caffeine_mg: 0, selenium_mcg: null });
    expect(got.thiamin).toBe(0.013);
    expect(got.caffeine).toBe(0);
    expect(got.selenium).toBeNull();
    for (const k of EXTENDED_KEYS) expect(k in got).toBe(true);
  });

  it('copes with a row from a database that has not been updated (no new columns at all)', () => {
    const got = ausnutExtraMicros({ id: 'F1', name: 'Milk', calories: 60 });
    expect(got.calcium).toBe(0);
    expect(got.saturatedFat).toBe(0);
    expect(got.thiamin).toBeNull();
    expect(Object.values(got).some(Number.isNaN)).toBe(false);
  });
});
