// How "full" a day looks in the calendar — calories logged as a share of
// the calorie target (capped at 100%, since the point is showing progress
// toward the goal, not how far over it someone went). With no target set,
// any logging at all just shows as full.
export function dayFillPct(day, calorieTarget) {
  if (!day || !day.calories) return 0;
  if (!calorieTarget) return day.loggedMeals > 0 ? 100 : 0;
  return Math.min(100, Math.round((day.calories / calorieTarget) * 100));
}

// Same "went over" signal as DayBudgetImpact's day-budget bar — a day with
// no target set can't be over one.
export function dayIsOver(day, calorieTarget) {
  return !!calorieTarget && !!day?.calories && day.calories > calorieTarget;
}
