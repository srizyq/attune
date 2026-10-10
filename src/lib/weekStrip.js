import { shiftDate } from './gestures.js';

const dayOfWeek = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};

/** The Sunday-to-Saturday week containing `date`, as 7 'YYYY-MM-DD' strings. */
export function weekDays(date) {
  const start = shiftDate(date, -dayOfWeek(date));
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}

// How far ahead of today a day can be opened (to plan meals in advance).
export const MAX_DAYS_AHEAD = 730;

/** The last day that can be opened: two years from `today`. */
export function latestDate(today) {
  return shiftDate(today, MAX_DAYS_AHEAD);
}

/**
 * Where a one-week swipe on the day strip lands: the same weekday a week back
 * (dir -1) or forward (dir +1). null only at the far end of how far ahead a
 * day can be opened.
 */
export function shiftWeek(date, dir, today) {
  const target = shiftDate(date, dir * 7);
  return target <= latestDate(today) ? target : null;
}
