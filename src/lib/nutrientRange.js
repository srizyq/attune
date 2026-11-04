import { contributorsFor } from './nutrientContributors';

// Averages over a week or a month. A day only counts if something was logged
// on it, so a day you forgot to track doesn't drag the average down.

/** The dates (YYYY-MM-DD) of the `days` days ending on `end`, oldest first. */
export function rangeDates(end, days) {
  const out = [];
  const d = new Date(`${end}T00:00:00`);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** How many of the dates have at least one logged item. */
export function loggedDayCount(items) {
  return new Set((items || []).map((i) => i.loggedDate).filter(Boolean)).size;
}

/**
 * Per-day totals of one nutrient (measured, else estimated) for each date, plus
 * the average over logged days. `dates` is the whole period, oldest first.
 */
export function dailyTotals(key, items, estimates, dates) {
  const byDate = new Map(dates.map((d) => [d, []]));
  for (const item of items || []) if (byDate.has(item.loggedDate)) byDate.get(item.loggedDate).push(item);
  const days = dates.map((date) => {
    const list = byDate.get(date);
    return { date, logged: list.length > 0, total: contributorsFor(key, list, estimates).total };
  });
  const logged = days.filter((d) => d.logged);
  const average = logged.length ? logged.reduce((s, d) => s + d.total, 0) / logged.length : 0;
  return { days, loggedDays: logged.length, average };
}

/** Average per logged day of every one of `keys`: { key: number }. */
export function averages(keys, items, estimates, dates) {
  return Object.fromEntries(keys.map((key) => [key, dailyTotals(key, items, estimates, dates).average]));
}

/** Average per logged day of calories and macros. */
export function macroAverages(items, dates) {
  const logged = loggedDayCount(items);
  const sum = (field) => (items || []).reduce((s, i) => s + (Number(i[field]) || 0), 0);
  const div = (n) => (logged ? n / logged : 0);
  return { cal: div(sum('cal')), protein: div(sum('protein')), carbs: div(sum('carbs')), fat: div(sum('fat')), loggedDays: logged, periodDays: dates.length };
}

const normalName = (r) => `${(r.brand || '').toLowerCase()}|${r.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;

/**
 * Contributors over a period, combining the same food logged on several days
 * into one row with how many times it was eaten and its average per logged day.
 */
export function groupedContributors(key, items, estimates, loggedDays) {
  const { rows, unknown, none, total, count } = contributorsFor(key, items, estimates);
  const groups = new Map();
  for (const r of rows) {
    const k = normalName(r);
    const g = groups.get(k) || { id: k, name: r.name, brand: r.brand, amount: 0, times: 0, kind: r.kind, via: r.via, item: r.item, meal: null };
    g.amount += r.amount;
    g.times += 1;
    if (r.kind === 'estimated') { g.kind = 'estimated'; g.via = r.via; }
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.amount - a.amount);
  for (const g of list) { g.perDay = loggedDays ? g.amount / loggedDays : 0; g.share = total > 0 ? (g.amount / total) * 100 : 0; }
  const unique = (arr) => [...new Map(arr.map((r) => [normalName(r), r])).values()];
  return { rows: list, unknown: unique(unknown), none: unique(none), total, perDay: loggedDays ? total / loggedDays : 0, count };
}
