// A coach's meal plan set against what the client actually logged, day by day.
//
// What it can honestly say: for each planned meal, did the client log it from
// the plan (they tapped "Log this meal" on their plan — the strongest signal),
// log something else in that slot, or log nothing. It cannot say that something
// logged by search "was" the planned meal, so those are reported as "ate
// something else" rather than guessed to match.
import { DAYS, MEALS, dayTotals, loggedPlanMeals, weekdayKey } from './mealPlan';

const num = (v) => Number(v) || 0;
const round = (n) => Math.round(n);

// planDays: the plan's `days`. foodLogs: food_logs rows (logged_date, meal,
// food_name, calories, protein_g, source). dates: ISO dates, oldest first.
// today: ISO date — a planned meal not yet logged today is 'pending', not a miss.
export function planVsActual(planDays, foodLogs, dates, today) {
  const byDate = new Map();
  for (const l of foodLogs || []) {
    if (!byDate.has(l.logged_date)) byDate.set(l.logged_date, []);
    byDate.get(l.logged_date).push(l);
  }

  const days = [];
  for (const date of dates) {
    const key = weekdayKey(date);
    const planDay = planDays?.[key];
    const plannedItems = MEALS.flatMap((m) => planDay?.[m.key] || []);
    if (plannedItems.length === 0) continue; // nothing planned that weekday

    const logs = byDate.get(date) || [];
    const asApp = logs.map((l) => ({ meal: l.meal, name: l.food_name, source: l.source }));
    const fromPlan = loggedPlanMeals(planDay, asApp);
    const meals = MEALS.filter((m) => (planDay?.[m.key] || []).length > 0).map((m) => {
      const planned = dayTotals({ [m.key]: planDay[m.key] }).calories;
      let status;
      if (fromPlan.has(m.key)) status = 'plan';
      else if (logs.some((l) => l.meal === m.key)) status = 'other';
      else status = date >= today ? 'pending' : 'none';
      return { meal: m.key, label: m.label, plannedCalories: planned, status };
    });

    const planned = dayTotals(planDay);
    days.push({
      date,
      weekday: DAYS.find((d) => d.key === key)?.label,
      planned: { calories: planned.calories, protein_g: planned.protein_g },
      actual: { calories: round(logs.reduce((s, l) => s + num(l.calories), 0)), protein_g: round(logs.reduce((s, l) => s + num(l.protein_g), 0)) },
      meals,
    });
  }

  const all = days.flatMap((d) => d.meals);
  const count = (status) => all.filter((m) => m.status === status).length;
  const judged = all.length - count('pending');
  return {
    days,
    summary: { plannedMeals: judged, fromPlan: count('plan'), somethingElse: count('other'), skipped: count('none'), pending: count('pending') },
  };
}
