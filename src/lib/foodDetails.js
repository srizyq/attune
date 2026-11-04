import { MICRO_NUTRIENTS, formatMicro } from './microNutrients';
import { hasData } from './microEstimate';

// Fibre, sodium and sugar come with every food source (AI estimates too), so a
// zero there is a real zero rather than "no data".
const ALWAYS_PRESENT = new Set(['fibre', 'sodium', 'sugar']);
const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));

/**
 * What one nutrient reads as for a food: its own figure, an estimate from a
 * similar food (marked ~), or no data.
 * Returns { kind: 'measured' | 'estimated' | 'none', text }.
 */
export function nutrientReading(food, key, estimate) {
  const n = BY_KEY[key];
  if (ALWAYS_PRESENT.has(key) || hasData(food, key)) return { kind: 'measured', text: `${formatMicro(n, food[key])}${n.unit}` };
  const est = estimate?.micros?.[key];
  const usable = est != null && (n.extended ? Number.isFinite(Number(est)) : Number(est) > 0);
  if (usable) return { kind: 'estimated', text: `~${formatMicro(n, est)}${n.unit}` };
  return { kind: 'none', text: 'No data' };
}

// The details page's sections, in the order people look for them (the same
// grouping as a Kiwi/Cronometer-style nutrition label). Every nutrient the app
// tracks appears once; test: foodDetails.test.js.
export const DETAIL_GROUPS = [
  { label: 'Carbohydrates', keys: ['fibre', 'sugar', 'addedSugar'] },
  { label: 'Fats', keys: ['saturatedFat', 'transFat', 'monounsaturatedFat', 'polyunsaturatedFat', 'cholesterol', 'omega3', 'omega6', 'alphaLinolenicAcid'] },
  { label: 'Vitamins', keys: ['vitaminA', 'thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'folate', 'vitaminB12', 'vitaminC', 'vitaminD', 'vitaminE'] },
  { label: 'Minerals', keys: ['calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'sodium', 'zinc', 'selenium', 'iodine'] },
  { label: 'Other', keys: ['caffeine', 'alcohol'] },
];

/**
 * nutrientReading plus what the details row draws: the number itself and its
 * share of the usual daily target (null where a nutrient has no target).
 * `via` says how an estimate was found ('ausnut' | 'usda' | 'ai').
 */
export function nutrientDetail(food, key, estimate) {
  const reading = nutrientReading(food, key, estimate);
  const n = BY_KEY[key];
  const value = reading.kind === 'measured' ? Number(food[key]) || 0 : reading.kind === 'estimated' ? Number(estimate.micros[key]) : null;
  const pct = value != null && n.defaultTarget ? (value / n.defaultTarget) * 100 : null;
  return { ...reading, value, pct, via: reading.kind === 'estimated' ? estimate.via || 'ausnut' : null };
}

/** How many of the listed nutrients are measured, estimated, or without a figure. */
export function detailCoverage(food, estimate) {
  const out = { measured: 0, estimated: 0, none: 0 };
  for (const g of DETAIL_GROUPS) for (const key of g.keys) out[nutrientReading(food, key, estimate).kind] += 1;
  return out;
}
