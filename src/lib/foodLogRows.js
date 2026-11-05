// What a food_logs row looks like for a logged food, built from the app's own
// food object. db.js saves exactly this, and useFoodLogs shows the very same
// row the instant a food is logged (before the server has answered), so the
// two can never disagree about what a log entry contains.
import { extendedToRow } from './microNutrients';

// The row to insert, plus the optional columns (extended nutrients, brand,
// ingredients) that db.js drops on retry if the database lacks them.
export function buildFoodLogRow(userId, entry) {
  const row = {
      user_id: userId,
      logged_date: entry.loggedDate,
      meal: entry.meal,
      food_name: entry.name,
      calories: entry.cal || 0,
      protein_g: entry.protein || 0,
      carbs_g: entry.carbs || 0,
      fat_g: entry.fat || 0,
      fibre_g: entry.fibre || 0,
      sodium_mg: entry.sodium || 0,
      sugar_g: entry.sugar || 0,
      saturated_fat_g: entry.saturatedFat || 0,
      trans_fat_g: entry.transFat || 0,
      cholesterol_mg: entry.cholesterol || 0,
      potassium_mg: entry.potassium || 0,
      added_sugar_g: entry.addedSugar || 0,
      vitamin_d_mcg: entry.vitaminD || 0,
      calcium_mg: entry.calcium || 0,
      iron_mg: entry.iron || 0,
      vitamin_a_mcg: entry.vitaminA || 0,
      vitamin_c_mg: entry.vitaminC || 0,
      polyunsaturated_fat_g: entry.polyunsaturatedFat || 0,
      monounsaturated_fat_g: entry.monounsaturatedFat || 0,
      magnesium_mg: entry.magnesium || 0,
      zinc_mg: entry.zinc || 0,
      vitamin_b12_mcg: entry.vitaminB12 || 0,
      folate_mcg: entry.folate || 0,
      serving_grams: entry.servingGrams || null,
      logged_at: entry.loggedAt ? entry.loggedAt.toISOString() : null,
      source: entry.source || 'local',
      logged_amount: entry.loggedAmount ?? null,
      logged_unit: entry.loggedUnit ?? null,
      serving_label: entry.servingLabel ?? null,
      slot_id: entry.slotId ?? null,
  };
  // The extended nutrients (B vitamins, selenium, ...) and brand only go in
  // when the food actually carries them. If the database hasn't had its
  // update yet, retry without them so logging food never breaks over a
  // missing column.
  const extended = {
    ...extendedToRow(entry),
    ...(entry.brand ? { brand: entry.brand } : {}),
    // A photo-scanned meal keeps the ingredients it was made of, shown when the entry is expanded.
    ...(Array.isArray(entry.ingredients) && entry.ingredients.length ? { ingredients: entry.ingredients } : {}),
  };
  return { row, extended };
}

// The columns an edit changes, plus the extended ones kept apart for the
// same retry.
export function buildFoodLogPatch(entry) {
  const patch = {
    calories: entry.cal || 0,
    protein_g: entry.protein || 0,
    carbs_g: entry.carbs || 0,
    fat_g: entry.fat || 0,
    fibre_g: entry.fibre || 0,
    sodium_mg: entry.sodium || 0,
    sugar_g: entry.sugar || 0,
    saturated_fat_g: entry.saturatedFat || 0,
    trans_fat_g: entry.transFat || 0,
    cholesterol_mg: entry.cholesterol || 0,
    potassium_mg: entry.potassium || 0,
    added_sugar_g: entry.addedSugar || 0,
    vitamin_d_mcg: entry.vitaminD || 0,
    calcium_mg: entry.calcium || 0,
    iron_mg: entry.iron || 0,
    vitamin_a_mcg: entry.vitaminA || 0,
    vitamin_c_mg: entry.vitaminC || 0,
    polyunsaturated_fat_g: entry.polyunsaturatedFat || 0,
    monounsaturated_fat_g: entry.monounsaturatedFat || 0,
    magnesium_mg: entry.magnesium || 0,
    zinc_mg: entry.zinc || 0,
    vitamin_b12_mcg: entry.vitaminB12 || 0,
    folate_mcg: entry.folate || 0,
    serving_grams: entry.servingGrams || null,
  };
  // All optional — only touched when the caller actually included them, so
  // an amount-only edit never accidentally resets the others. Lets an
  // already-logged item move to a different meal (free tier) or a
  // different logged time (Pro), instead of requiring delete + re-add.
  if (entry.meal !== undefined) patch.meal = entry.meal;
  if (entry.loggedAt !== undefined) patch.logged_at = entry.loggedAt ? entry.loggedAt.toISOString() : null;
  // logged_amount/logged_unit weren't in here at all until now — every
  // other field this function patches was kept in sync on edit, but these
  // two (which Recent/Frequent's row subtitle and quick-re-add prefill
  // read directly off the row, see recentRowMeta in FoodSearch.jsx) stayed
  // frozen at whatever was first logged, so editing an item's amount left
  // its macros and its displayed portion disagreeing from then on.
  if (entry.loggedAmount !== undefined) patch.logged_amount = entry.loggedAmount;
  if (entry.loggedUnit !== undefined) patch.logged_unit = entry.loggedUnit;
  if (entry.slotId !== undefined) patch.slot_id = entry.slotId;
  // Extended nutrients: only touched when the entry has a value, so an edit can
  // never overwrite an unknown with a made-up zero (and never trips on a
  // database that hasn't had its update yet, unless real data needs saving).
  const extended = extendedToRow(entry);
  return { patch, extended };
}
