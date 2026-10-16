// One definition of "a day on target", shared by everything that judges a
// client's logging: the coach's client list (database function
// get_client_summaries — supabase/schema.sql, "Coach insights and target
// ownership", which hard-codes these same numbers), the Overview tiles, the
// weekly summary and the reports. supabase/tests/coach-insights.test.js probes
// both sides at the edges, so changing a number here without the SQL (or the
// other way round) fails a test.

// A day is on target when its calories are within this fraction of that day's
// own target (training-day or rest-day).
export const ON_TARGET_TOLERANCE = 0.1;
// Protein counts as hit at this fraction of the target or above.
export const PROTEIN_HIT = 0.9;
// A day is "complete" when at least this many of the four meal slots have
// something logged. Only complete days can be judged on target: a day with
// just breakfast logged is missing data, not a well-judged day.
export const COMPLETE_DAY_MEALS = 3;

export const isCompleteDay = (mealsLogged) => (Number(mealsLogged) || 0) >= COMPLETE_DAY_MEALS;

export function isOnTarget(calories, target) {
  const c = Number(calories);
  const t = Number(target);
  if (!(t > 0) || !(c > 0)) return false;
  return c >= t * (1 - ON_TARGET_TOLERANCE) && c <= t * (1 + ON_TARGET_TOLERANCE);
}

export function isProteinHit(protein, target) {
  const p = Number(protein);
  const t = Number(target);
  return t > 0 && p >= t * PROTEIN_HIT;
}

export const tolerancePct = () => Math.round(ON_TARGET_TOLERANCE * 100);
