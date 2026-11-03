import { useMemo } from 'react';
import { useProfile } from './useProfile';
import { useFoodLogs } from './useFoodLogs';
import { hasProAccess } from '../lib/proAccess';
import { todayLocalDate } from '../lib/patterns';
import { scaleFood } from '../lib/foodMath';
import { mealFromDate, currentTimeHHMM, timeStringToDate, formatTimeFromDate } from '../lib/mealTime';
import { slotFor } from '../lib/daySlots';
import { perServing } from '../lib/recipeTags';

export const RECIPE_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// Logging a recipe, the same way from the list's quick "Log" button and from a
// recipe's own page: n servings, to a meal — or to a time, for people who log
// by time slots. `log` resolves to the message to show, and throws if the save fails.
export function useRecipeLogging() {
  const { profile } = useProfile();
  const today = todayLocalDate();
  const { addFood, daySlots, refetch } = useFoodLogs(today);
  const logByTime = hasProAccess(profile) && (profile?.daily_log_view || 'meals') === 'slots';
  const defaultMeal = useMemo(() => {
    const m = mealFromDate(new Date());
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, []);

  async function log(recipe, servings, meal = defaultMeal, time = currentTimeHHMM()) {
    const scaled = scaleFood(perServing(recipe), servings);
    const loggedAt = logByTime ? timeStringToDate(time, new Date(`${today}T00:00:00`)) : null;
    await addFood(
      { ...scaled, name: recipe.name, servingLabel: `${servings} serving${servings === 1 ? '' : 's'}`, source: 'recipe' },
      logByTime ? null : meal,
      loggedAt,
      logByTime ? slotFor(daySlots, { at: loggedAt }) : null,
    );
    refetch();
    return `${recipe.name} added${logByTime ? ` at ${formatTimeFromDate(loggedAt)}` : ` to ${meal}`}`;
  }

  return { log, logByTime, defaultMeal };
}
