import { describe, it, expect } from 'vitest';
import { nutritionTiles, MAX_TILES } from './entryNutrition';

const food = { cal: 114, protein: 20, carbs: 7, fat: 0.4, fibre: 0, sodium: 50, sugar: 6, calcium: 180, potassium: 250, addedSugar: 0 };

describe('nutritionTiles', () => {
  it('always shows fibre, sugar and sodium, and only the others the food has a figure for', () => {
    const keys = nutritionTiles(food, {}).map((t) => t.key);
    expect(keys).toEqual(['fibre', 'sugar', 'sodium', 'calcium', 'potassium']);
  });

  it('never shows an unknown nutrient as 0', () => {
    expect(nutritionTiles({ ...food, calcium: 0, potassium: 0 }, {}).map((t) => t.key)).toEqual(['fibre', 'sugar', 'sodium']);
  });

  it('gives each tile its value, unit and share of the daily target', () => {
    const calcium = nutritionTiles(food, { calcium: 1000 }).find((t) => t.key === 'calcium');
    expect(calcium).toMatchObject({ label: 'Calcium', value: 180, unit: 'mg' });
    expect(calcium.pct).toBeCloseTo(18);
  });

  it('notes the added sugar when there is some', () => {
    expect(nutritionTiles({ ...food, addedSugar: 4.26 }, {}).find((t) => t.key === 'sugar').added).toBe(4.3);
    expect(nutritionTiles(food, {}).find((t) => t.key === 'sugar').added).toBeNull();
  });

  it('caps the list; the rest is on the full details page', () => {
    const rich = { ...food, saturatedFat: 2, cholesterol: 10, iron: 1, magnesium: 20, zinc: 1, vitaminA: 50, vitaminC: 5 };
    expect(nutritionTiles(rich, {})).toHaveLength(MAX_TILES);
  });
});
