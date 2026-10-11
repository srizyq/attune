// The vitamins and minerals Open Food Facts carries for a product, as the
// app-side food fields. OFF reports everything per 100 g and in grams (even a
// vitamin that is a few millionths of a gram), so each value is converted to the
// unit food_logs stores and scaled by `factor` (grams in the serving / 100).
//
// Two groups, as everywhere else in the app:
//  - the original nutrients: a product OFF has no figure for reads 0, as before;
//  - the extended set (B vitamins, selenium, ...): no figure stays null, because
//    "no data" must not read as "none".

// [app key, OFF field, multiplier from OFF's grams to the stored unit, decimal places]
const ORIGINAL = [
  ['saturatedFat', 'saturated-fat_100g', 1, 1],
  ['transFat', 'trans-fat_100g', 1, 1],
  ['cholesterol', 'cholesterol_100g', 1e3, 0],
  ['potassium', 'potassium_100g', 1e3, 0],
  ['addedSugar', 'added-sugars_100g', 1, 1],
  ['vitaminD', 'vitamin-d_100g', 1e6, 1],
  ['calcium', 'calcium_100g', 1e3, 0],
  ['iron', 'iron_100g', 1e3, 1],
  ['vitaminA', 'vitamin-a_100g', 1e6, 0],
  ['vitaminC', 'vitamin-c_100g', 1e3, 1],
  ['polyunsaturatedFat', 'polyunsaturated-fat_100g', 1, 1],
  ['monounsaturatedFat', 'monounsaturated-fat_100g', 1, 1],
  ['magnesium', 'magnesium_100g', 1e3, 1],
  ['zinc', 'zinc_100g', 1e3, 1],
  ['vitaminB12', 'vitamin-b12_100g', 1e6, 1],
  ['folate', 'vitamin-b9_100g', 1e6, 0],
];

const EXTENDED = [
  ['thiamin', 'vitamin-b1_100g', 1e3, 2],
  ['riboflavin', 'vitamin-b2_100g', 1e3, 2],
  ['niacin', 'vitamin-pp_100g', 1e3, 2],
  ['vitaminB6', 'vitamin-b6_100g', 1e3, 2],
  ['vitaminE', 'vitamin-e_100g', 1e3, 2],
  ['phosphorus', 'phosphorus_100g', 1e3, 0],
  ['selenium', 'selenium_100g', 1e6, 1],
  ['iodine', 'iodine_100g', 1e6, 0],
  ['caffeine', 'caffeine_100g', 1e3, 0],
  ['omega3', 'omega-3-fat_100g', 1e3, 0],
  ['omega6', 'omega-6-fat_100g', 1, 2],
  ['alphaLinolenicAcid', 'alpha-linolenic-acid_100g', 1, 2],
];

// Some products use the older field name for folate.
const ALIASES = { 'vitamin-b9_100g': ['folates_100g'] };

function read(per100, field) {
  for (const name of [field, ...(ALIASES[field] || [])]) {
    const raw = per100?.[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

export function microsFromOFF(per100, factor = 1) {
  const out = {};
  for (const [key, field, mult, dp] of ORIGINAL) {
    const v = read(per100, field);
    out[key] = v == null ? 0 : round(v * factor * mult, dp);
  }
  for (const [key, field, mult, dp] of EXTENDED) {
    const v = read(per100, field);
    if (v != null) out[key] = round(v * factor * mult, dp);
  }
  return out;
}
