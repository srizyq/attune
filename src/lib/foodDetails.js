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
