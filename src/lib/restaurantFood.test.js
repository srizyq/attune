import { describe, it, expect } from 'vitest';
import { mapRestaurantItemRow } from './restaurantFood';

const baseRow = {
  id: 'mcdonalds-au_big-mac',
  chain_name: "McDonald's",
  name: 'Big Mac',
  size_label: null,
  serving_label: '1 burger (219g)',
  serving_grams: 219,
  calories: 502,
  protein_g: 25.4,
  carbs_g: 41.8,
  fat_g: 25.5,
  fibre_g: 3.4,
  sodium_mg: 970,
  sugar_g: 8.9,
};

describe('mapRestaurantItemRow', () => {
  it('does not suffix the name when there is no size variant', () => {
    const got = mapRestaurantItemRow(baseRow);
    expect(got.name).toBe('Big Mac');
    expect(got.meta).toBe("1 burger (219g) · McDonald's");
    expect(got.source).toBe('restaurant-chain');
  });

  it('appends the size label to the name when one exists', () => {
    const got = mapRestaurantItemRow({ ...baseRow, name: 'Coca-Cola', size_label: 'Large', serving_label: '1 cup (700ml)' });
    expect(got.name).toBe('Coca-Cola (Large)');
  });

  it('rounds the core macros with the app\'s usual precision', () => {
    const got = mapRestaurantItemRow(baseRow);
    expect(got).toMatchObject({ cal: 502, protein: 25.4, carbs: 41.8, fat: 25.5, fibre: 3.4, sodium: 970, sugar: 8.9 });
  });

  it('leaves unpublished extended micronutrients as null rather than 0 (ausnutExtraMicros passthrough)', () => {
    const got = mapRestaurantItemRow(baseRow);
    expect(got.thiamin).toBeNull();
    expect(got.caffeine).toBeNull();
    expect(got.vitaminA).toBe(0);
  });
});
