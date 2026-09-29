import { ausnutExtraMicros } from './ausnutFood';

// Maps a restaurant_items row (see supabase/schema.sql's "Restaurant chains"
// block) into the shape FoodSearch.jsx's other sources produce. Pulled out
// of FoodSearch.jsx into its own testable function because size_label-into-
// name is the one bit of behaviour this source has that AUSNUT/common_dishes
// don't, and it's an easy thing to get backwards (e.g. every item rendering
// as "Big Mac (null)"). Reuses ausnutExtraMicros since restaurant_items
// shares ausnut_foods' exact nutrient column set — most chains only publish
// the 8ish core nutrients menu-labelling laws require, so the extended
// fields usually come back null (never fabricated to fill them in), same
// "null means unknown" convention ausnutExtraMicros already respects.
export function mapRestaurantItemRow(row) {
  return {
    id: 'restaurant_' + row.id,
    name: row.name + (row.size_label ? ` (${row.size_label})` : ''),
    meta: `${row.serving_label} · ${row.chain_name}`,
    cuisine: 'all',
    cal: Math.round(row.calories),
    protein: Math.round(row.protein_g * 10) / 10,
    carbs: Math.round(row.carbs_g * 10) / 10,
    fat: Math.round(row.fat_g * 10) / 10,
    fibre: Math.round(row.fibre_g * 10) / 10,
    sodium: Math.round(row.sodium_mg),
    sugar: Math.round(row.sugar_g * 10) / 10,
    vitaminA: Math.round(row.vitamin_a_mcg || 0),
    vitaminC: Math.round((row.vitamin_c_mg || 0) * 10) / 10,
    polyunsaturatedFat: Math.round((row.polyunsaturated_fat_g || 0) * 10) / 10,
    monounsaturatedFat: Math.round((row.monounsaturated_fat_g || 0) * 10) / 10,
    magnesium: Math.round((row.magnesium_mg || 0) * 10) / 10,
    zinc: Math.round((row.zinc_mg || 0) * 10) / 10,
    vitaminB12: Math.round((row.vitamin_b12_mcg || 0) * 10) / 10,
    folate: Math.round(row.folate_mcg || 0),
    ...ausnutExtraMicros(row),
    source: 'restaurant-chain',
    servingGrams: row.serving_grams || 100,
  };
}
