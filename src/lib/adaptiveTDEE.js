// Adaptive calorie targeting — instead of a fixed formula-based estimate
// (BMR × activity multiplier, computed once), this re-estimates the
// user's *actual* maintenance calories from their own logged weight
// trend vs. logged intake, the way MacroFactor's adaptive TDEE works.
// Deterministic, no network calls — same "honest, gated" ethos as
// lib/patterns.js: it refuses to guess until there's enough real data.

import { todayLocalDate } from './patterns';
import { calcGoalAdjustment, clampToFloor } from './calorieTargets';

// Body-composition energy density: ~7700 kcal stored/released per kg of
// body-mass change (a standard approximation covering mixed fat/lean
// tissue and water, used broadly in sports-science TDEE-estimation —
// not a proprietary constant).
const KCAL_PER_KG = 7700;

// How many days of "memory" the weight trend carries — roughly a week's
// worth of noise (water, sodium, digestion) gets smoothed out, while
// still tracking a real trend within 2-3 weeks.
const TREND_TAU_DAYS = 7;

// Need at least this many days of trend-weight span, and at least this
// many separate days with calories actually logged within that span,
// before trusting an estimate — otherwise a couple of noisy data points
// could swing the target wildly.
const MIN_TREND_SPAN_DAYS = 14;
const MIN_LOGGED_CALORIE_DAYS = 10;

// Noise tolerance. The scale swings ±1–2 kg day to day on water and sodium
// alone, and a food diary has gaps — so neither raw input is trusted
// point-for-point:
//  - the weight *rate* is the median pairwise slope (Theil–Sen) across
//    the window's weigh-ins, not "last smoothed weight minus first", so one
//    salty-dinner spike or a fluky first weigh-in can't swing the result;
//  - a logged day far below the user's own typical day is treated as an
//    unfinished diary (breakfast logged, then life happened), not as
//    having eaten that little — left in, each one drags estimated
//    maintenance down, which lowers the target, which pushes the user to
//    under-eat, which the next window reads as lower still;
//  - and an estimate nobody could believe is withheld rather than turned
//    into a calorie target.
const MIN_WEIGH_INS = 4;
// Pairs of weigh-ins closer than this give a slope that is mostly noise.
const MIN_PAIR_GAP_DAYS = 3;
// A logged day is "incomplete" below this fraction of the window's median
// logged day, or below the absolute floor, whichever is higher.
const INCOMPLETE_DAY_FRACTION = 0.5;
const INCOMPLETE_DAY_FLOOR_KCAL = 500;
// Outside this range the data is more likely wrong than the person.
const PLAUSIBLE_TDEE_MIN = 1200;
const PLAUSIBLE_TDEE_MAX = 5500;

// Exported so any UI plotting raw + trend weight together (Progress.jsx)
// converts both through the same conversion, instead of the chart
// plotting whatever unit each row happened to be logged in.
export function toKg(weight, unit) {
  return unit === 'lb' ? Number(weight) * 0.453592 : Number(weight);
}

export function fromKg(kg, unit) {
  return unit === 'lb' ? kg / 0.453592 : kg;
}

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateB + 'T00:00:00') - new Date(dateA + 'T00:00:00')) / 86400000);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// Gap-aware exponential smoothing: a weight logged after a long gap
// pulls the trend toward it faster than one logged the day after the
// last entry, since a stale trend shouldn't cling to old data through a
// multi-week silence.
export function computeTrendWeight(weightLogs) {
  const sorted = [...weightLogs]
    .filter(w => w.weight != null && w.logged_date)
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date));
  if (sorted.length === 0) return [];

  const points = [];
  let trend = toKg(sorted[0].weight, sorted[0].unit);
  points.push({ date: sorted[0].logged_date, trend, raw: trend });

  for (let i = 1; i < sorted.length; i++) {
    const raw = toKg(sorted[i].weight, sorted[i].unit);
    const gapDays = Math.max(0, daysBetween(sorted[i - 1].logged_date, sorted[i].logged_date));
    const decay = Math.exp(-gapDays / TREND_TAU_DAYS);
    trend = raw + (trend - raw) * decay;
    points.push({ date: sorted[i].logged_date, trend, raw });
  }
  return points;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median of every pairwise slope (kg/day) between weigh-ins at least
// MIN_PAIR_GAP_DAYS apart. Up to half the pairs can be wrecked by outliers
// before the answer moves. Returns null if no pair is far enough apart.
function robustSlopeKgPerDay(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = daysBetween(points[i].date, points[j].date);
      if (dt >= MIN_PAIR_GAP_DAYS) slopes.push((points[j].raw - points[i].raw) / dt);
    }
  }
  return slopes.length ? median(slopes) : null;
}

// dailyCalories: array of { date, calories } (one row per day, 0 for
// days with nothing logged — the caller decides which days "count" by
// only including days that actually have calories > 0, since a day with
// calories:0 usually means "didn't log", not "ate nothing").
//
// Says *why* when it can't produce an estimate, so the UI can tell the
// user what to do next. estimateTDEE below is the estimate-or-null form.
export function assessTDEE(trendPoints, dailyCalories) {
  if (trendPoints.length < 2) return { ok: false, reason: 'not-enough-span', daysNeeded: MIN_TREND_SPAN_DAYS };

  const endPoint = trendPoints[trendPoints.length - 1];
  const spanDays = daysBetween(trendPoints[0].date, endPoint.date);
  if (spanDays < MIN_TREND_SPAN_DAYS) return { ok: false, reason: 'not-enough-span', daysNeeded: MIN_TREND_SPAN_DAYS - spanDays };

  if (trendPoints.length < MIN_WEIGH_INS) return { ok: false, reason: 'not-enough-weigh-ins', daysNeeded: MIN_WEIGH_INS - trendPoints.length };

  const loggedInSpan = dailyCalories.filter(d => d.calories > 0 && d.date >= trendPoints[0].date && d.date <= endPoint.date);
  const dayFloor = Math.max(INCOMPLETE_DAY_FLOOR_KCAL, INCOMPLETE_DAY_FRACTION * (loggedInSpan.length ? median(loggedInSpan.map(d => d.calories)) : 0));
  const loggedDays = loggedInSpan.filter(d => d.calories >= dayFloor);
  if (loggedDays.length < MIN_LOGGED_CALORIE_DAYS) {
    return { ok: false, reason: 'not-enough-logged-days', daysNeeded: MIN_LOGGED_CALORIE_DAYS - loggedDays.length };
  }

  const slope = robustSlopeKgPerDay(trendPoints);
  if (slope == null) return { ok: false, reason: 'not-enough-weigh-ins', daysNeeded: 1 };

  const avgCalIn = loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length;
  const dailyEnergyStored = slope * KCAL_PER_KG;
  const tdee = avgCalIn - dailyEnergyStored;
  if (!(tdee >= PLAUSIBLE_TDEE_MIN && tdee <= PLAUSIBLE_TDEE_MAX)) return { ok: false, reason: 'implausible-estimate' };

  return {
    ok: true,
    estimate: {
      tdee: Math.round(tdee),
      avgCalIn: Math.round(avgCalIn),
      weightChangeKg: Math.round(slope * spanDays * 10) / 10,
      weeklyRateKg: Math.round(slope * 7 * 100) / 100,
      spanDays,
      loggedDayCount: loggedDays.length,
      excludedDayCount: loggedInSpan.length - loggedDays.length,
      weighInCount: trendPoints.length,
      startTrend: Math.round(trendPoints[0].trend * 10) / 10,
      endTrend: Math.round(endPoint.trend * 10) / 10,
    },
  };
}

export function estimateTDEE(trendPoints, dailyCalories) {
  const result = assessTDEE(trendPoints, dailyCalories);
  return result.ok ? result.estimate : null;
}

// Top-level entry point: given raw weight_logs + a date->calories map,
// returns either a full result (estimate + resulting target) or a
// `blocked` result explaining what's still needed, so the UI always has
// something honest to show instead of a silent gap.
// `paceKgPerWeek` is the user's chosen weekly rate (same field Calculated
// mode uses) — the target is estimated maintenance plus the offset that
// rate implies, so the two modes mean the same thing by "lose 0.5 kg/week".
// Without one it falls back to the old flat offset.
export function computeAdaptiveTarget(weightLogs, dailyCalories, goal, paceKgPerWeek) {
  const trendPoints = computeTrendWeight(weightLogs);
  if (trendPoints.length === 0) {
    return { ready: false, reason: 'no-weight-logs' };
  }

  const assessed = assessTDEE(trendPoints, dailyCalories);
  if (!assessed.ok) {
    const { reason, daysNeeded } = assessed;
    return daysNeeded === undefined ? { ready: false, reason } : { ready: false, reason, daysNeeded };
  }

  const { calories, clamped } = clampToFloor(Math.round(assessed.estimate.tdee + calcGoalAdjustment(goal, paceKgPerWeek)));
  return { ready: true, estimate: assessed.estimate, target: calories, clamped, computedAt: todayLocalDate() };
}

// A time series of TDEE re-estimates (a rolling 3-week window, stepping
// forward weekly by default) instead of just the single current
// snapshot — so a chart can show how estimated maintenance has actually
// moved, the way MacroFactor's expenditure graph does. Windows with too
// little data inside them are skipped rather than shown as a guess, so
// the line only ever plots real, gated estimates.
export function computeExpenditureHistory(weightLogs, dailyCalories, { windowDays = 21, stepDays = 7 } = {}) {
  const trendPoints = computeTrendWeight(weightLogs);
  if (trendPoints.length < 2) return [];

  const firstDate = trendPoints[0].date;
  const lastDate = trendPoints[trendPoints.length - 1].date;
  const results = [];

  let windowStart = firstDate;
  while (true) {
    const windowEnd = addDays(windowStart, windowDays);
    if (windowEnd > lastDate) break;

    const windowTrend = trendPoints.filter(p => p.date >= windowStart && p.date <= windowEnd);
    const windowCalories = dailyCalories.filter(d => d.date >= windowStart && d.date <= windowEnd);
    const estimate = estimateTDEE(windowTrend, windowCalories);
    if (estimate) results.push({ date: windowEnd, tdee: estimate.tdee });

    windowStart = addDays(windowStart, stepDays);
  }
  return results;
}
