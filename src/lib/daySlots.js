// Pro's custom-named slot timeline (profile.daily_log_view === 'slots') — a
// user-defined set of per-day windows (e.g. "Morning Fuel" at 8:30am,
// "Pre-Workout" at 4:15pm), stored in public.day_slots (see
// supabase/schema.sql), instead of the fixed meal enum (mealFromDate) or
// literal clock hours (buildDayTimeline) the other two views use.

import { formatTime12h } from './mealTime';

// Postgres `time` comes back as "HH:MM:SS" (or "HH:MM") — no caller here
// ever sets seconds, so trim to "HH:MM" once at the boundary rather than
// carrying the extra precision through every comparison/format call below.
function hhmm(timeStr) {
  return (timeStr || '00:00').slice(0, 5);
}

export function formatSlotTime(timeStr) {
  return formatTime12h(hhmm(timeStr));
}

// Raw public.day_slots row -> the camelCase shape the UI/tests use, mirroring
// useFoodLogs.js's mapRow for food_logs rows.
export function mapSlotRow(row) {
  return {
    id: row.id,
    label: row.label,
    slotTime: hhmm(row.slot_time),
    sortOrder: row.sort_order ?? 0,
    targetCalories: row.target_calories != null ? Number(row.target_calories) : null,
    targetProtein: row.target_protein_g != null ? Number(row.target_protein_g) : null,
    targetCarbs: row.target_carbs_g != null ? Number(row.target_carbs_g) : null,
    targetFat: row.target_fat_g != null ? Number(row.target_fat_g) : null,
  };
}

// Buckets a day's food_logs items (useFoodLogs.js's mapRow shape, keyed by
// item.slotId) under their day_slots (mapSlotRow shape), sorted by time of
// day. Items whose slotId doesn't match any of today's slots — a slot that
// got deleted (on delete set null), or a row from before Slots mode was ever
// used — land in a trailing 'unsorted' segment instead of silently
// disappearing, mirroring buildDayTimeline's gap segments for the hourly
// view (always returned, even when empty, so the UI doesn't need a separate
// no-slots-yet check beyond `segments.length === 0`).
export function buildSlotTimeline(slots, items) {
  const sorted = [...(slots || [])].sort((a, b) => hhmm(a.slotTime).localeCompare(hhmm(b.slotTime)) || a.sortOrder - b.sortOrder);
  const byId = new Map(sorted.map((s) => [s.id, { type: 'slot', ...s, items: [] }]));

  const unsorted = [];
  for (const item of items || []) {
    const bucket = item.slotId && byId.get(item.slotId);
    if (bucket) bucket.items.push(item);
    else unsorted.push(item);
  }

  const segments = sorted.map((s) => byId.get(s.id));
  if (unsorted.length > 0) {
    segments.push({ type: 'unsorted', id: 'unsorted', label: 'Unsorted', items: unsorted });
  }
  return segments;
}

// The slot a new item should default into when the add-food flow wasn't
// told an explicit one (no "APPEND TO <slot>" tap) — the latest slot whose
// time is at or before now, mirroring mealFromDate's time-of-day default for
// the meal-enum view. Wraps to the day's first slot when it's earlier than
// all of them (rather than the previous day's last slot, which the current
// day's timeline can't show anyway), and returns null for a day with no
// slots yet.
export function slotFromTime(slots, date = new Date()) {
  if (!slots || slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => hhmm(a.slotTime).localeCompare(hhmm(b.slotTime)) || a.sortOrder - b.sortOrder);
  const now = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  let candidate = sorted[0];
  for (const s of sorted) {
    if (hhmm(s.slotTime) <= now) candidate = s;
  }
  return candidate;
}
