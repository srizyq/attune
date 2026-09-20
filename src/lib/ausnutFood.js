import { extendedFromRow } from './microNutrients';

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// The micronutrients an ausnut_foods row (per 100 g) carries beyond the macros
// and the original handful FoodSearch maps inline — as the app-side food fields.
// Two groups:
//  • nutrients the app already tracks but AUSNUT foods used to log as 0 because
//    the table lacked the columns (calcium, iron, potassium, saturated / trans
//    fat, cholesterol, added sugar, vitamin D) — the source has real values;
//  • the extended set, where NULL (not yet loaded, or genuinely unknown) stays
//    null instead of becoming 0.
export function ausnutExtraMicros(row) {
  return {
    saturatedFat: r1(row.saturated_fat_g),
    transFat: r1(row.trans_fat_g),
    cholesterol: Math.round(Number(row.cholesterol_mg) || 0),
    potassium: Math.round(Number(row.potassium_mg) || 0),
    addedSugar: r1(row.added_sugar_g),
    vitaminD: r1(row.vitamin_d_mcg),
    calcium: Math.round(Number(row.calcium_mg) || 0),
    iron: r1(row.iron_mg),
    ...extendedFromRow(row),
  };
}
