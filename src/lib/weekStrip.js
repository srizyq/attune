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

/**
 * Where a one-week swipe on the day strip lands: the same weekday a week back
 * (dir -1) or forward (dir +1), never later than `today`. null when that week
 * is entirely in the future.
 */
export function shiftWeek(date, dir, today) {
  const target = shiftDate(date, dir * 7);
  if (target <= today) return target;
  const [firstDay] = weekDays(target);
  return firstDay <= today ? today : null;
}
