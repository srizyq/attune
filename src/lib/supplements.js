import { MICRO_NUTRIENTS } from './microNutrients';

// Supplements: a saved list of what one serving contains, logged as 0 kcal food
// entries so they count in every nutrient total.

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));

// The nutrients a supplement form offers: vitamins, minerals and long-chain
// omega-3 — what supplements actually contain.
export const SUPPLEMENT_FIELDS = [
  { label: 'Vitamins', keys: ['vitaminA', 'thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'folate', 'vitaminB12', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'choline'] },
  { label: 'Minerals', keys: ['calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine', 'copper', 'manganese'] },
  { label: 'Fats', keys: ['omega3'] },
];

/** Form text values ({ key: '12' }) -> { key: number } of the positive ones, ignoring anything unknown. */
export function nutrientsFromForm(form) {
  const out = {};
  for (const [key, raw] of Object.entries(form || {})) {
    const n = Number(raw);
    if (BY_KEY[key] && String(raw).trim() !== '' && Number.isFinite(n) && n > 0 && n < 100000) out[key] = n;
  }
  return out;
}

/** A saved supplement row -> the food object the log takes (0 kcal, source 'supplement'). */
export function supplementToFood(row) {
  const food = { name: row.name, cal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, sugar: 0, servingLabel: row.serving_label || '1 serving', source: 'supplement' };
  for (const [key, v] of Object.entries(row.nutrients || {})) if (BY_KEY[key] && Number.isFinite(Number(v))) food[key] = Number(v);
  return food;
}

export const isSupplement = (item) => item?.source === 'supplement';

/** One line summarising what a supplement contains, e.g. "Vitamin D 25mcg · Vitamin C 500mg · +2 more". */
export function supplementSummary(row, max = 3) {
  const entries = Object.entries(row.nutrients || {}).filter(([k]) => BY_KEY[k]);
  const shown = entries.slice(0, max).map(([k, v]) => `${BY_KEY[k].label} ${v}${BY_KEY[k].unit}`);
  return shown.join(' · ') + (entries.length > max ? ` · +${entries.length - max} more` : '');
}
