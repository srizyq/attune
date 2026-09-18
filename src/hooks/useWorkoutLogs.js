import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getWorkoutLogsForDate, getWorkoutLogsForRange, addWorkoutLog, deleteWorkoutLog } from '../lib/db';

function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    intensity: row.intensity,
    durationMinutes: Number(row.duration_minutes) || 0,
    caloriesBurned: Number(row.calories_burned) || 0,
    createdAt: row.created_at || null,
  };
}

// Mirrors useFoodLogs' shape (refetch/create/remove, date-scoped) so
// Dashboard's Activity card can treat workouts the same way the rest of
// the app treats food logs.
export function useWorkoutLogs(date) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !date) { setRows([]); setLoading(false); return; }
    setLoading(true);
    // Unhandled before — a network blip here left loading stuck true
    // forever (see useCustomFoods for the same fix applied consistently
    // across the data hooks).
    try {
      const data = await getWorkoutLogsForDate(user.id, date);
      setRows(data);
    } catch (err) {
      console.error('Failed to load workout logs:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  useEffect(() => { refetch(); }, [refetch]);

  const workouts = useMemo(() => rows.map(mapRow), [rows]);
  const totalCaloriesBurned = useMemo(() => workouts.reduce((s, w) => s + w.caloriesBurned, 0), [workouts]);

  const create = useCallback(async (entry) => {
    if (!user) return;
    await addWorkoutLog(user.id, { ...entry, loggedDate: date });
    await refetch();
  }, [user, date, refetch]);

  const remove = useCallback(async (id) => {
    await deleteWorkoutLog(id);
    await refetch();
  }, [refetch]);

  return { workouts, totalCaloriesBurned, loading, create, remove, refetch };
}

// Per-day burned-calorie totals across a date range, for the Dashboard
// chart's "eat back exercise calories" target line — that line needs each
// day's own burn total, not just the currently-viewed day's (see
// useWorkoutLogs above, which is intentionally single-date-scoped for the
// Activity card). Returns a Map<date, totalCaloriesBurned> rather than raw
// rows since the chart only ever needs the per-day sum.
export function useWorkoutLogsRange(startDate, endDate) {
  const { user } = useAuth();
  const [burnedByDate, setBurnedByDate] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !startDate || !endDate) { setBurnedByDate(new Map()); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await getWorkoutLogsForRange(user.id, startDate, endDate);
      const map = new Map();
      for (const row of rows) {
        const date = row.logged_date;
        map.set(date, (map.get(date) || 0) + (Number(row.calories_burned) || 0));
      }
      setBurnedByDate(map);
    } catch (err) {
      console.error('Failed to load workout logs range:', err);
      setBurnedByDate(new Map());
    } finally {
      setLoading(false);
    }
  }, [user, startDate, endDate]);

  useEffect(() => { refetch(); }, [refetch]);

  return { burnedByDate, loading, refetch };
}
