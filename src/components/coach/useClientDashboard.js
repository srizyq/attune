import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useHistory } from '../../hooks/useHistory';
import { useWeightLogs } from '../../hooks/useWeightLogs';
import { useClientFoodLogs, useClientWorkouts } from '../../hooks/useCoach';
import { getCheckinForDate } from '../../lib/db';
import { todayLocalDate, dateNDaysAgo, dateRange, streakFor, computeStreak } from '../../lib/patterns';
import { computeTrendWeight, toKg, fromKg } from '../../lib/adaptiveTDEE';
import { MICRO_NUTRIENTS } from '../../lib/microNutrients';
import { ACCENT, WATER_BLUE, avg } from './constants';

// Everything the trainer's client tabs read, fetched and derived once so the
// tabs themselves are just layout. `clientData` is the (possibly just-edited)
// copy of the client's goal/target fields; `client` supplies the id.
export function useClientDashboard(client, clientData) {
  const { theme } = useTheme();
  const today = todayLocalDate();
  const [date, setDate] = useState(today);
  const [range, setRange] = useState(7);
  const [checkin, setCheckin] = useState(null);

  const isLight = theme === 'light';
  const chartTextMuted = isLight ? '#6b6b6b' : '#666666';
  const chartGrid = isLight ? '#e7e7e5' : '#2a2a2a';

  const { dailyData, loading: historyLoading } = useHistory(dateNDaysAgo(range - 1), today, client.id);
  const { dailyData: badgeData } = useHistory(dateNDaysAgo(59), today, client.id);
  const { logs: weightLogs, latest: latestWeight, loading: weightLoading } = useWeightLogs(dateNDaysAgo(range - 1), today, client.id);
  const { meals, loading: foodLoading } = useClientFoodLogs(client.id, date);
  // Fetched once for the last 90 days; the Diary tab filters to the selected
  // day and Progress to the selected range, instead of a query per view.
  const { workouts, loading: workoutsLoading } = useClientWorkouts(client.id, dateNDaysAgo(89), today);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ci = await getCheckinForDate(client.id, date);
        if (!cancelled) setCheckin(ci);
      } catch (err) {
        console.error('Failed to load check-in:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [client.id, date]);

  const weightUnit = clientData.unit === 'imperial' ? 'lb' : 'kg';
  const calorieTarget = clientData.calorie_target || null;
  const proteinTarget = clientData.protein_g || null;

  const byDate = useMemo(() => new Map(dailyData.map(d => [d.date, d])), [dailyData]);
  const allDates = useMemo(() => dateRange(dateNDaysAgo(range - 1), today), [range, today]);
  const filledDays = allDates.map(d => byDate.get(d) || { date: d, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, loggedMeals: 0, energy: null, mood: null });
  const loggedDays = filledDays.filter(d => d.loggedMeals > 0);
  const hasData = loggedDays.length > 0;

  const energyDays = filledDays.filter(d => d.energy != null);
  const stats = {
    hasData,
    loggedDays,
    energyDays,
    avgCalories: Math.round(avg(loggedDays.map(d => d.calories))),
    avgProtein: Math.round(avg(loggedDays.map(d => d.protein_g))),
    avgCarbs: Math.round(avg(loggedDays.map(d => d.carbs_g))),
    avgFat: Math.round(avg(loggedDays.map(d => d.fat_g))),
    daysOnTarget: calorieTarget ? loggedDays.filter(d => Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.1).length : 0,
    avgEnergy: energyDays.length ? avg(energyDays.map(d => d.energy)).toFixed(1) : null,
  };

  const streaks = {
    logging: computeStreak(badgeData),
    calorie: calorieTarget ? streakFor(badgeData, d => d.calories > 0 && Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.15) : 0,
    mood: streakFor(badgeData, d => d.mood != null),
    protein: proteinTarget ? streakFor(badgeData, d => d.protein_g >= proteinTarget * 0.9) : 0,
  };

  // Same heatmap-strip treatment as the client's own Expenditure page, so a
  // trainer's view matches what the client sees.
  const calorieHeatmapDays = filledDays.map(d => {
    const pct = !d.calories ? null : calorieTarget ? Math.min(100, Math.round((d.calories / calorieTarget) * 100)) : 100;
    return {
      date: d.date,
      pct,
      tooltip: `${new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: ${d.calories ? `${Math.round(d.calories)} kcal` : 'nothing logged'}`,
    };
  });

  const trendPoints = useMemo(() => computeTrendWeight(weightLogs), [weightLogs]);
  const trendByDate = useMemo(() => new Map(trendPoints.map(p => [p.date, p.trend])), [trendPoints]);
  const weightChartData = {
    labels: weightLogs.map(w => new Date(w.logged_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })),
    datasets: [
      {
        label: 'Weight', data: weightLogs.map(w => Math.round(fromKg(toKg(w.weight, w.unit), weightUnit) * 10) / 10),
        borderColor: ACCENT, backgroundColor: ACCENT + '22', fill: true, tension: 0.3, spanGaps: true,
        pointRadius: weightLogs.length > 60 ? 0 : 3,
      },
      {
        label: 'Trend',
        data: weightLogs.map(w => {
          const t = trendByDate.get(w.logged_date);
          return t != null ? Math.round(fromKg(t, weightUnit) * 10) / 10 : null;
        }),
        borderColor: WATER_BLUE, backgroundColor: 'transparent', fill: false, tension: 0.3, spanGaps: true,
        pointRadius: 0, borderWidth: 2,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: chartTextMuted, boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTextMuted, font: { size: 10 } }, grid: { color: chartGrid } },
    },
  };

  // Full micronutrient breakdown for the selected day — same nutrient list
  // and card as the client's own Nutrients page, summed from the read-only
  // meals already loaded for the food log rather than a second fetch.
  const microTotals = useMemo(() => {
    const totals = {};
    for (const n of MICRO_NUTRIENTS) totals[n.key] = 0;
    for (const items of Object.values(meals)) {
      for (const item of items) {
        for (const n of MICRO_NUTRIENTS) totals[n.key] += Number(item[n.key]) || 0;
      }
    }
    return totals;
  }, [meals]);

  return {
    today, date, setDate, range, setRange,
    calorieTarget, proteinTarget, weightUnit,
    historyLoading, stats, streaks, calorieHeatmapDays,
    weightLogs, latestWeight, weightLoading, weightChartData, chartOptions,
    meals, foodLoading, checkin,
    microTotals, microTargets: clientData.micro_targets || {}, hasAnyFood: Object.values(meals).some(items => items.length > 0),
    workouts, workoutsLoading,
  };
}
