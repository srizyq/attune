// Training-day / rest-day targets. A profile's calorie_target / protein_g /
// carbs_g / fat_g are the everyday (training-day) targets; rest_day_targets
// optionally overrides them on days that are NOT in training_days. The feature
// is only in effect when both are present — otherwise every day uses the base
// targets exactly as before. A nutrient left out of rest_day_targets falls back
// to its base target.
//
// Mirrors target_for_date / valid_rest_day_targets / valid_training_days in
// supabase/schema.sql; supabase/tests/day-targets.test.js compares the two.

// Monday first for display; `dow` is the number stored (0 = Sunday .. 6 =
// Saturday — JavaScript's getDay, Postgres's extract(dow ...)).
export const WEEKDAYS = [
  { dow: 1, short: 'Mon', label: 'Monday' },
  { dow: 2, short: 'Tue', label: 'Tuesday' },
  { dow: 3, short: 'Wed', label: 'Wednesday' },
  { dow: 4, short: 'Thu', label: 'Thursday' },
  { dow: 5, short: 'Fri', label: 'Friday' },
  { dow: 6, short: 'Sat', label: 'Saturday' },
  { dow: 0, short: 'Sun', label: 'Sunday' },
];
export const MAX_CALORIES = 20000;
export const MAX_GRAMS = 2000;

// Field -> [key in rest_day_targets, the profile's base column, label, unit].
export const TARGET_FIELDS = [
  { key: 'calories', column: 'calorie_target', label: 'Calories', unit: 'kcal', max: MAX_CALORIES },
  { key: 'protein_g', column: 'protein_g', label: 'Protein', unit: 'g', max: MAX_GRAMS },
  { key: 'carbs_g', column: 'carbs_g', label: 'Carbs', unit: 'g', max: MAX_GRAMS },
  { key: 'fat_g', column: 'fat_g', label: 'Fat', unit: 'g', max: MAX_GRAMS },
];

// 'YYYY-MM-DD' -> 0..6 (Sunday = 0), read at UTC midnight so it depends only on
// the calendar date, never on the machine's timezone. null for a bad date.
export function dowOf(isoDate) {
  const dow = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`).getUTCDay();
  return Number.isNaN(dow) ? null : dow;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Whether the profile has rest-day targets in effect at all.
export function dayTargetsActive(profile) {
  const rest = profile?.rest_day_targets;
  return !!rest && typeof rest === 'object' && Object.keys(rest).length > 0
    && Array.isArray(profile.training_days) && profile.training_days.length > 0;
}

// The targets that apply on one date: { calories, protein_g, carbs_g, fat_g,
// isRestDay }. Unset targets are null. isRestDay is true only when the
// rest-day set is actually what's being returned.
export function targetsForDate(profile, isoDate) {
  const out = { isRestDay: false };
  for (const f of TARGET_FIELDS) out[f.key] = profile?.[f.column] ?? null;
  if (!dayTargetsActive(profile)) return out;
  const dow = dowOf(isoDate);
  if (dow === null || profile.training_days.includes(dow)) return out;
  out.isRestDay = true;
  for (const f of TARGET_FIELDS) if (isNum(profile.rest_day_targets[f.key])) out[f.key] = profile.rest_day_targets[f.key];
  return out;
}

// Stored -> form state.
export function dayTargetsToInputs(profile) {
  const rest = profile?.rest_day_targets || {};
  return {
    inputs: Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, isNum(rest[f.key]) ? String(rest[f.key]) : ''])),
    trainingDays: Array.isArray(profile?.training_days) ? [...profile.training_days] : [],
  };
}

// Form state -> what to save, or the first problem in words. Blank fields are
// left out (they fall back to the everyday target). Nothing entered and no days
// chosen means "not using rest-day targets" and clears both.
export function parseDayTargetInputs(inputs, trainingDays) {
  const rest = {};
  for (const f of TARGET_FIELDS) {
    const raw = String(inputs?.[f.key] ?? '').trim();
    if (raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > f.max) {
      return { rest: null, trainingDays: null, error: `${f.label} must be a number between 0 and ${f.max.toLocaleString()}.` };
    }
    rest[f.key] = value;
  }
  const days = [...new Set((trainingDays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const hasRest = Object.keys(rest).length > 0;
  if (!hasRest && days.length === 0) return { rest: null, trainingDays: null, error: null };
  if (hasRest && days.length === 0) return { rest: null, trainingDays: null, error: 'Choose which weekdays are training days.' };
  if (!hasRest) return { rest: null, trainingDays: null, error: 'Enter at least one rest-day target, or clear the training days.' };
  if (days.length === 7) return { rest: null, trainingDays: null, error: 'Every day is marked as a training day, so rest-day targets would never apply.' };
  return { rest, trainingDays: days, error: null };
}

// "Mon, Wed, Fri" for a list of training weekdays, in Monday-first order.
export function describeTrainingDays(days) {
  const set = new Set(days || []);
  return WEEKDAYS.filter((d) => set.has(d.dow)).map((d) => d.short).join(', ');
}
