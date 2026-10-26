// Which nutrients stand out in a day, for a coach scanning a client's diary:
// the ones well short of their target, and the ones over their limit. Sodium at
// 25% of its limit is good news and fibre at 25% of its target is not, so the
// two kinds are judged separately.
import { MICRO_NUTRIENTS } from './microNutrients';

// Nutrients whose guideline is a ceiling ("under 2,300 mg"), not a goal.
export const LIMIT_NUTRIENTS = ['sodium', 'sugar', 'saturatedFat', 'cholesterol', 'addedSugar', 'caffeine'];

// Below this share of the target counts as "low".
export const LOW_BELOW_PCT = 70;

const hasNoData = (n, extendedInfo) => !!n.extended && extendedInfo?.withData === 0;

// microTotals: key -> total for the day. microTargets: a coach's own targets
// (key -> number); anything missing falls back to the standard guideline.
// Returns null when there's nothing to judge, otherwise { low, high } — each
// a list of { key, label, pct }, worst first, at most `max` long.
export function nutrientGaps(microTotals, microTargets = {}, extendedInfo = null, { max = 3 } = {}) {
  if (!microTotals) return null;
  const low = [];
  const high = [];
  for (const n of MICRO_NUTRIENTS) {
    const target = Number(microTargets?.[n.key]) || n.defaultTarget;
    if (!target || hasNoData(n, extendedInfo)) continue;
    const pct = Math.round((((Number(microTotals[n.key]) || 0) / target) * 100));
    if (LIMIT_NUTRIENTS.includes(n.key)) {
      if (pct > 100) high.push({ key: n.key, label: n.label, pct });
    } else if (pct < LOW_BELOW_PCT) {
      low.push({ key: n.key, label: n.label, pct });
    }
  }
  low.sort((a, b) => a.pct - b.pct);
  high.sort((a, b) => b.pct - a.pct);
  return { low: low.slice(0, max), high: high.slice(0, max) };
}

// "Fibre 25% · Calcium 33%" for a short list of gaps.
export const describeGaps = (list) => list.map((g) => `${g.label} ${g.pct}%`).join(' · ');
