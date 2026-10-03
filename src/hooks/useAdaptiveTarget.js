import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { getWeightLogsForRange, getFoodLogsForRange } from '../lib/db';
import { computeAdaptiveTarget } from '../lib/adaptiveTDEE';
import { todayLocalDate, dateNDaysAgo } from '../lib/patterns';

// Computes (and optionally persists) an adaptive calorie target from the
// user's own logged weight trend + intake. No server-side cron — this is
// called from page mounts (Dashboard on every visit, Settings when the
// user opens the Adaptive tab) so the target stays reasonably fresh
// purely from normal app usage, the same "recompute on next relevant
// open" approach used for the pattern engine rather than adding
// background infrastructure for something this low-stakes.
export function useAdaptiveTarget() {
  const { user } = useAuth();

  // 60-day window: gives the trend-weight/TDEE math room to look back
  // further than its own minimum (14-day span, 10 logged days) without
  // fetching someone's entire history every time this runs.
  const compute = useCallback(async (goal, paceKgPerWeek) => {
    if (!user) return { ready: false, reason: 'no-weight-logs' };
    const today = todayLocalDate();
    const start = dateNDaysAgo(59, new Date());
    const [weightLogs, foodLogs] = await Promise.all([
      getWeightLogsForRange(user.id, start, today),
      getFoodLogsForRange(user.id, start, today),
    ]);

    const dailyCaloriesMap = new Map();
    for (const log of foodLogs) {
      const d = log.logged_date;
      dailyCaloriesMap.set(d, (dailyCaloriesMap.get(d) || 0) + (Number(log.calories) || 0));
    }
    const dailyCalories = [...dailyCaloriesMap.entries()].map(([date, calories]) => ({ date, calories }));

    return computeAdaptiveTarget(weightLogs, dailyCalories, goal, paceKgPerWeek);
  }, [user]);

  return { compute };
}
