// The calorie chart's 1M / 3M ranges show one bar per calendar week (Sunday
// start, matching the 1W chart and the day strip) instead of one per day —
// 30 or 90 daily bars are too thin to read and used to push the card wider
// than the screen. A bar is the average over the days in that week that
// actually have food logged: counting a not-yet-logged (or skipped) day as 0
// would drag every average down and make the chart look worse than it is.

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' of the Sunday on or before `date` — pure string/UTC maths so it
// can't drift with the device's time zone or DST.
export function weekStartOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - t.getUTCDay());
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * @param days ascending [{ date, calories, baseTarget?, caloriesBurned? }]
 * @returns one entry per week, same shape the daily chart uses, plus
 *          { endDate, loggedDays, dayCount }
 */
export function bucketWeeks(days) {
  const weeks = new Map();
  for (const day of days) {
    const key = weekStartOf(day.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(day);
  }
  return [...weeks].map(([weekStart, group]) => {
    const logged = group.filter((d) => Number(d.calories) > 0);
    const targets = group.map((d) => d.baseTarget).filter((t) => Number.isFinite(t));
    return {
      date: weekStart,
      endDate: group[group.length - 1].date,
      calories: Math.round(mean(logged.map((d) => Number(d.calories)))),
      baseTarget: targets.length ? Math.round(mean(targets)) : undefined,
      caloriesBurned: Math.round(mean(group.map((d) => Number(d.caloriesBurned) || 0))),
      loggedDays: logged.length,
      dayCount: group.length,
    };
  });
}
