import { hasProAccess } from './proAccess.js';
import { shiftDate } from './gestures.js';

// Temporary calorie limit (Pro): "eat at most N kcal a day from today until
// <date>", e.g. a short cut before a holiday. While one is active every
// target the app shows for those days — dashboard, daily log, chart, scan
// budgets — uses it, with protein/carbs/fat scaled by the same ratio so all
// the rings agree. It reverts on its own afterwards, and days inside it keep
// the target they had (the periods are kept, ended ones included).
//
// Stored on the profile as `calorie_limit_periods`, an array of
//   { id, start, end, calories, created_at }   (dates are 'YYYY-MM-DD', end inclusive)
// and mirrored by valid_calorie_limit_periods in supabase/schema.sql.

export const LIMIT_MIN_CALORIES = 1200; // same floor as the calculated targets (calorieTargets.MIN_CALORIES)
export const LIMIT_MAX_CALORIES = 10000;
export const LIMIT_MAX_DAYS = 365;
export const MAX_STORED_PERIODS = 60;
export const KEEP_HISTORY_DAYS = 400;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (d) => typeof d === 'string' && ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function validPeriod(p) {
  return !!p && typeof p === 'object' && isIso(p.start) && isIso(p.end) && p.start <= p.end
    && num(p.calories) !== null && p.calories > 0;
}

/** The profile's stored periods, minus anything malformed. */
export function limitPeriods(profile) {
  const raw = profile?.calorie_limit_periods;
  return Array.isArray(raw) ? raw.filter(validPeriod) : [];
}

/** The limit covering this date, or null. Only Pro accounts have limits in effect. */
export function activeLimit(profile, isoDate) {
  if (!hasProAccess(profile) || !isIso(isoDate)) return null;
  return limitPeriods(profile).find((p) => p.start <= isoDate && isoDate <= p.end) || null;
}

/**
 * The day's targets with a limit applied: calories become the limit and
 * protein/carbs/fat are scaled by limit ÷ the day's own calorie target.
 * Targets that were unset stay unset; with no calorie target to compare to,
 * the macros are left alone.
 */
export function limitedTargets(targets, period) {
  const out = { ...targets, calories: period.calories };
  const base = targets.calories;
  if (!(base > 0)) return out;
  const ratio = period.calories / base;
  for (const key of ['protein_g', 'carbs_g', 'fat_g']) {
    if (typeof targets[key] === 'number') out[key] = Math.round(targets[key] * ratio);
  }
  return out;
}

/** Whole days remaining including `today` (1 on the last day), 0 once over. */
export function daysLeft(period, today) {
  if (today > period.end) return 0;
  const from = today < period.start ? period.start : today;
  return Math.round((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function periodLengthDays(period) {
  return Math.round((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** End date for "N days starting today" (today counts as day 1). */
export function endDateForDays(today, days) {
  return shiftDate(today, days - 1);
}

/**
 * Starting a limit today. Returns { periods } (the new full list) or { error }.
 * One limit at a time: starting while one is running is refused.
 */
export function startLimit(periods, { calories, endDate, today, id, nowIso }) {
  const cal = Number(calories);
  if (!Number.isFinite(cal) || cal < LIMIT_MIN_CALORIES) return { error: `The lowest limit you can set is ${LIMIT_MIN_CALORIES.toLocaleString()} kcal a day.` };
  if (cal > LIMIT_MAX_CALORIES) return { error: `That's above ${LIMIT_MAX_CALORIES.toLocaleString()} kcal — please check the number.` };
  if (!isIso(endDate)) return { error: 'Pick an end date.' };
  if (endDate < today) return { error: 'The end date has to be today or later.' };
  if (periodLengthDays({ start: today, end: endDate }) > LIMIT_MAX_DAYS) return { error: `A limit can run for up to ${LIMIT_MAX_DAYS} days.` };
  if (periods.some((p) => p.end >= today)) return { error: 'You already have a limit running — end it first to set a new one.' };

  const period = { id, start: today, end: endDate, calories: Math.round(cal), created_at: nowIso };
  const cutoff = shiftDate(today, -KEEP_HISTORY_DAYS);
  const kept = periods.filter((p) => p.end >= cutoff);
  return { periods: [...kept, period].slice(-MAX_STORED_PERIODS) };
}

/**
 * Ending a limit early. A limit that hasn't covered a day yet is removed;
 * one that has is cut to end yesterday, so today onwards use the normal
 * target and the days already lived under it keep theirs.
 */
export function endLimitEarly(periods, id, today) {
  return periods.flatMap((p) => {
    if (p.id !== id) return [p];
    if (p.start >= today) return [];
    return [{ ...p, end: shiftDate(today, -1) }];
  });
}

/** The limit running today, or one that starts later (for the settings card). */
export function currentOrUpcoming(profile, today) {
  return limitPeriods(profile).find((p) => p.end >= today) || null;
}

/** Past limits, newest first. */
export function pastLimits(profile, today) {
  return limitPeriods(profile).filter((p) => p.end < today).sort((a, b) => b.end.localeCompare(a.end));
}
