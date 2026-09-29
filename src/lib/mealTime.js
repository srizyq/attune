// Shared helpers for the meal/time logging split: free-tier users (and Pro
// users on the Meals view) pick a meal category (breakfast/lunch/dinner/
// snacks); Pro users on the Slots view (src/lib/daySlots.js) log against an
// actual clock time instead, placed into a custom-named slot rather than a
// meal category.

const MEAL_WINDOWS = [
  { meal: 'breakfast', before: 11 },
  { meal: 'lunch', before: 15 },
  { meal: 'dinner', before: 21 },
];

// A sensible meal-category default based on the current time of day,
// rather than always defaulting to Lunch regardless of when you're
// actually logging.
export function mealFromDate(d) {
  const h = d.getHours();
  for (const w of MEAL_WINDOWS) if (h < w.before) return w.meal;
  return 'snacks';
}

export function currentTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Combine today's date with a "HH:MM" string into a real Date.
export function timeStringToDate(hhmm, base = new Date()) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  const d = new Date(base);
  if (!Number.isNaN(h) && !Number.isNaN(m)) d.setHours(h, m, 0, 0);
  return d;
}

export function formatTime12h(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

export function formatTimeFromDate(d) {
  return formatTime12h(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

// The raw "HH:MM" a Date represents — for seeding a <input type="time">
// from an already-logged item's timestamp, as opposed to formatTimeFromDate
// above which is for display.
export function dateToHHMM(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Re-dates a logged_at timestamp onto a different calendar day, keeping its
// local wall-clock time — used when copying a food log to another day
// (a copied 8am item should still show as 8am on the new day, not at
// whatever UTC instant the source happened to fall on).
// destDateStr is a "YYYY-MM-DD" local-date string, same convention as
// todayLocalDate/logged_date throughout the app.
export function shiftIsoDateKeepLocalTime(isoString, destDateStr) {
  const src = new Date(isoString);
  const [y, m, d] = destDateStr.split('-').map(Number);
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds()).toISOString();
}
