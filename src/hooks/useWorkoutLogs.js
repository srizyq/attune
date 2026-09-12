import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getWorkoutLogsForDate, addWorkoutLog, deleteWorkoutLog } from '../lib/db';

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
    const data = await getWorkoutLogsForDate(user.id, date);
    setRows(data);
    setLoading(false);
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
