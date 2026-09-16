// Shared helpers for the meal/time logging split: free-tier users pick a
// meal category (breakfast/lunch/dinner/snacks); Pro users log against an
// actual clock time instead, with the log grouped hourly rather than by
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

export function formatHourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? 'am' : 'pm'}`;
}

// The hour's own on-the-hour time as "HH:MM" — used to preset the add-food
// flow's time field when jumping there from a specific hour on the
// timeline, rather than always defaulting to "right now".
export function hourToHHMM(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
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
// (Pro's hourly log should still show a copied 8am item at 8am on the new
// day, not at whatever UTC instant the source happened to fall on).
// destDateStr is a "YYYY-MM-DD" local-date string, same convention as
// todayLocalDate/logged_date throughout the app.
export function shiftIsoDateKeepLocalTime(isoString, destDateStr) {
  const src = new Date(isoString);
  const [y, m, d] = destDateStr.split('-').map(Number);
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds()).toISOString();
}

// Full 12am–11pm coverage for the Pro hourly view, instead of
// groupItemsByHour's "only show hours with something in them" (which
// reads as basically empty for most of the day). Contiguous stretches of
// empty hours collapse into a single 'gap' segment the UI can render as
// one line that expands into individual hour rows on tap, rather than
// listing 20+ empty hours by default.
export function buildDayTimeline(items) {
  const byHour = new Map();
  for (const item of items) {
    const ts = item.loggedAt || item.createdAt;
    if (!ts) continue;
    const hour = new Date(ts).getHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(item);
  }

  function makeGap(startHour, endHour) {
    const label = startHour === endHour
      ? formatHourLabel(startHour)
      : `${formatHourLabel(startHour)} – ${formatHourLabel((endHour + 1) % 24)}`;
    return {
      type: 'gap',
      id: `gap-${startHour}-${endHour}`,
      startHour,
      endHour,
      label,
      hours: Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    };
  }

  const segments = [];
  let gapStart = null;
  for (let hour = 0; hour < 24; hour++) {
    if (byHour.has(hour)) {
      if (gapStart !== null) { segments.push(makeGap(gapStart, hour - 1)); gapStart = null; }
      segments.push({ type: 'hour', hour, label: formatHourLabel(hour), items: byHour.get(hour) });
    } else if (gapStart === null) {
      gapStart = hour;
    }
  }
  if (gapStart !== null) segments.push(makeGap(gapStart, 23));
  return segments;
}
