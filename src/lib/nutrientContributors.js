import { MICRO_NUTRIENTS } from './microNutrients';
import { hasData } from './microEstimate';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));
// Fibre, sodium and sugar come with every food source, so a zero there is real.
const ALWAYS_PRESENT = new Set(['fibre', 'sodium', 'sugar']);
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2, snacks: 3 };

/**
 * Which logged foods supplied a nutrient on a day, biggest first.
 *
 * Each food contributes its own figure when it has one (kind 'measured'), else
 * the estimate borrowed from a similar food (kind 'estimated', with how it was
 * found), else nothing — those go in `unknown`. Foods that carry the nutrient at
 * 0 are `none`. `total` is exactly what the nutrient's card on the Nutrients
 * page adds up to, and each row's `share` is its part of that total (0–100).
 *
 * `estimates` is the Map(item id → { micros, via }) from useMicroEstimates.
 */
export function contributorsFor(key, items, estimates) {
  const rows = [];
  const unknown = [];
  const none = [];
  let total = 0;
  for (const item of items || []) {
    const entry = { id: item.id, name: item.name, brand: item.brand || null, meal: item.meal || null, item };
    // A supplement lists everything it contains, so what it doesn't list is none, not unknown.
    if (ALWAYS_PRESENT.has(key) || item.source === 'supplement' || hasData(item, key)) {
      const amount = Number(item[key]) || 0;
      if (amount > 0) { rows.push({ ...entry, amount, kind: 'measured', via: null }); total += amount; } else none.push(entry);
      continue;
    }
    const est = estimates?.get?.(item.id);
    const v = est?.micros?.[key];
    const n = Number(v);
    const usable = v != null && Number.isFinite(n) && (BY_KEY[key]?.extended ? true : n > 0);
    if (usable && n > 0) { rows.push({ ...entry, amount: n, kind: 'estimated', via: est.via || 'ausnut' }); total += n; } else if (usable) none.push(entry);
    else unknown.push(entry);
  }
  rows.sort((a, b) => b.amount - a.amount || (MEAL_ORDER[a.meal] ?? 9) - (MEAL_ORDER[b.meal] ?? 9));
  for (const r of rows) r.share = total > 0 ? (r.amount / total) * 100 : 0;
  const estimatedTotal = rows.filter((r) => r.kind === 'estimated').reduce((s, r) => s + r.amount, 0);
  return { rows, unknown, none, total, estimatedTotal, count: (items || []).length };
}

/** One line on how much of the total is measured, for under the heading. */
export function contributorsNote({ rows, unknown, total, count }) {
  if (count === 0) return null;
  const est = rows.filter((r) => r.kind === 'estimated').length;
  const bits = [];
  if (est) bits.push(`${est} ${est === 1 ? 'food is' : 'foods are'} estimated from similar foods`);
  if (unknown.length) bits.push(`${unknown.length} ${unknown.length === 1 ? 'food has' : 'foods have'} no data`);
  if (!bits.length) return total > 0 ? 'Every food logged carries this nutrient.' : null;
  return `${bits.join(' · ')}, so this is ${unknown.length ? 'a minimum' : 'approximate'}.`;
}

// Whole numbers for large figures, a decimal or two for small ones, so a food
// that supplied 0.4mg never reads as 0.
export function fmtAmount(nutrient, value) {
  const v = Number(value) || 0;
  const dp = nutrient.extended ? 2 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return String(Number(v.toFixed(dp)));
}
