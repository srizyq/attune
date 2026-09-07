import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getRecentFoodLogs } from '../lib/db';

// The user's own most-often-logged foods, ranked by real log count rather
// than recency (MyFitnessPal's "Frequent" tab) — computed client-side from
// their recent history since the dataset is small enough not to need a
// backend aggregate query. Only foods logged more than once qualify, so
// this never just duplicates the "Recently logged" list.
export function useFrequentFoods(limit = 6) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const logs = await getRecentFoodLogs(user.id, 300);
    const counts = new Map();
    for (const row of logs) {
      const key = row.food_name.trim().toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { count: 1, row });
    }
    const ranked = Array.from(counts.values())
      .filter(e => e.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(e => e.row);
    setRows(ranked);
    setLoading(false);
  }, [user, limit]);

  useEffect(() => { refetch(); }, [refetch]);

  return { rows, loading, refetch };
}
