// The daily mood / energy / sleep tiles on the Dashboard (components/
// DayCheckinTiles.jsx) all write to the day's `checkins` row. Mood keeps the
// column's five text values; energy is *asked* on a 1–5 scale but stored on the
// column's existing 1–10 scale (level × 2) so the pattern engine, the
// Expenditure "Avg. energy" card and any older check-ins keep meaning the same
// thing; sleep is hours plus a 1–5 quality rating.

export const MOODS = [
  { id: 'great', emoji: '😄', label: 'Great' },
  { id: 'good', emoji: '🙂', label: 'Good' },
  { id: 'okay', emoji: '😐', label: 'Okay' },
  { id: 'low', emoji: '😔', label: 'Low' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
];

export const ENERGY_LABELS = ['Drained', 'Low', 'Steady', 'Good', 'Buzzing'];
export const SLEEP_QUALITY_LABELS = ['Poor', 'Fair', 'OK', 'Good', 'Great'];

export const MIN_SLEEP_HOURS = 0;
export const MAX_SLEEP_HOURS = 16;
export const SLEEP_QUICK_PICKS = [5, 6, 7, 8, 9];
export const DEFAULT_SLEEP_HOURS = 7;

export function moodFor(value) {
  return MOODS.find((m) => m.id === value) || null;
}

// Stored 1–10 → the 1–5 level to highlight; null when nothing's been chosen
// (or the value is junk).
export function energyToLevel(energy) {
  if (energy == null || energy === '') return null;
  const n = Number(energy);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n / 2)));
}

export function levelToEnergy(level) {
  return level * 2;
}

// Half-hour steps, clamped to what the tile offers.
export function clampSleepHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SLEEP_HOURS, Math.max(MIN_SLEEP_HOURS, Math.round(n * 2) / 2));
}

export function stepSleepHours(current, delta) {
  const base = current == null ? DEFAULT_SLEEP_HOURS : Number(current);
  return clampSleepHours(base + delta);
}

// 7.5 → "7h 30m", 8 → "8h", 0.5 → "30m".
export function formatSleep(hours) {
  if (hours == null || hours === '') return null;
  const n = Number(hours);
  if (!Number.isFinite(n)) return null;
  const total = Math.round(n * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// What each tile shows when collapsed — null means "not answered yet".
export function tileSummary(checkin) {
  const mood = moodFor(checkin?.mood);
  const level = energyToLevel(checkin?.energy);
  return {
    mood: mood ? `${mood.emoji} ${mood.label}` : null,
    energy: level ? `${level}/5` : null,
    sleep: formatSleep(checkin?.sleep_hours),
  };
}
