// "This week" on the Expenditure page: the last seven days against the seven
// before, in plain numbers. Deterministic and factual — nothing here guesses at
// causes. `dailyData` is the joined per-day rows from useHistory (calories,
// protein_g, mood/energy/sleep…), `weightLogs` the raw weight_logs rows.
import { toKg, fromKg } from './adaptiveTDEE';
import { energyToLevel } from './dayCheckin';

const ON_TARGET_TOLERANCE = 0.1; // same "within 10% of goal" the page's Days-on-target card uses
const MIN_FEEL_DAYS = 3; // averages of one or two answers say nothing

function shiftDate(date, deltaDays) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function avg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

function inWindow(date, start, end) {
  return date >= start && date <= end;
}

function weekStats(dailyData, start, end, targetFor) {
  const days = dailyData.filter((d) => inWindow(d.date, start, end));
  const logged = days.filter((d) => d.calories > 0);
  const targets = logged.map((d) => ({ d, t: targetFor ? targetFor(d.date) : null }));
  const withTarget = targets.filter((x) => x.t);
  return {
    daysLogged: logged.length,
    avgCalories: logged.length ? Math.round(avg(logged.map((d) => d.calories))) : null,
    avgProtein: logged.length ? Math.round(avg(logged.map((d) => d.protein_g || 0))) : null,
    daysOnTarget: withTarget.length ? withTarget.filter(({ d, t }) => Math.abs(d.calories - t) <= t * ON_TARGET_TOLERANCE).length : null,
    avgTarget: withTarget.length ? Math.round(avg(withTarget.map((x) => x.t))) : null,
    days,
  };
}

// Weight change across the week, in the user's unit: the latest weigh-in this
// week against the latest one from the week before — or, with none then, against
// the first one this week (needs two). Null when there's nothing to compare.
function weightChange(weightLogs, thisStart, today, prevStart, prevEnd, unit) {
  const logs = [...(weightLogs || [])].sort((a, b) => a.logged_date.localeCompare(b.logged_date));
  const thisWeek = logs.filter((l) => inWindow(l.logged_date, thisStart, today));
  if (thisWeek.length === 0) return null;
  const latest = thisWeek[thisWeek.length - 1];
  const prev = logs.filter((l) => inWindow(l.logged_date, prevStart, prevEnd)).pop();
  const baseline = prev || (thisWeek.length >= 2 ? thisWeek[0] : null);
  if (!baseline) return null;
  const change = fromKg(toKg(latest.weight, latest.unit) - toKg(baseline.weight, baseline.unit), unit);
  return { change: Math.round(change * 10) / 10, unit, latest: Math.round(fromKg(toKg(latest.weight, latest.unit), unit) * 10) / 10 };
}

function feelStats(days) {
  const pick = (fn) => days.map(fn).filter((v) => v != null);
  const mood = pick((d) => d.moodScore);
  const energy = pick((d) => energyToLevel(d.energy));
  const sleep = pick((d) => d.sleepHours);
  const quality = pick((d) => d.sleepQuality);
  const out = {
    mood: mood.length >= MIN_FEEL_DAYS ? Math.round(avg(mood) * 10) / 10 : null,
    energy: energy.length >= MIN_FEEL_DAYS ? Math.round(avg(energy) * 10) / 10 : null,
    sleepHours: sleep.length >= MIN_FEEL_DAYS ? Math.round(avg(sleep) * 10) / 10 : null,
    sleepQuality: quality.length >= MIN_FEEL_DAYS ? Math.round(avg(quality) * 10) / 10 : null,
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// Returns null when the last seven days hold nothing at all to summarise.
export function weeklySummary({ dailyData, weightLogs, today, targetFor, unit = 'kg' }) {
  const thisStart = shiftDate(today, -6);
  const prevEnd = shiftDate(today, -7);
  const prevStart = shiftDate(today, -13);
  const rows = dailyData || [];

  const week = weekStats(rows, thisStart, today, targetFor);
  const prev = weekStats(rows, prevStart, prevEnd, targetFor);
  const weight = weightChange(weightLogs, thisStart, today, prevStart, prevEnd, unit);
  const feel = feelStats(week.days);
  if (week.daysLogged === 0 && !weight && !feel) return null;

  return {
    daysLogged: week.daysLogged,
    avgCalories: week.avgCalories,
    avgProtein: week.avgProtein,
    daysOnTarget: week.daysOnTarget,
    avgTarget: week.avgTarget,
    // Versus the week before — only when both weeks have food logged.
    caloriesVsLastWeek: week.avgCalories != null && prev.avgCalories != null ? week.avgCalories - prev.avgCalories : null,
    weight,
    feel,
  };
}
