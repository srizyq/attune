import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getSavedMeals, addSavedMeal, updateSavedMeal, deleteSavedMeal } from '../lib/db';

// Recipes — named bundles of ingredients that log as one action, e.g.
// "My usual breakfast" = oats + banana + honey, makes 1 serving.
export function useSavedMeals() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getSavedMeals(user.id);
      setRows(data);
    } catch (err) {
      console.error("Failed to load saved meals:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (name, items, servings = 1) => {
    if (!user) return;
    const created = await addSavedMeal(user.id, name, items, servings);
    setRows(prev => [created, ...prev]);
    return created;
  }, [user]);

  const update = useCallback(async (id, { name, items, servings }) => {
    const updated = await updateSavedMeal(id, { name, items, servings });
    setRows(prev => prev.map(r => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const remove = useCallback(async (id) => {
    await deleteSavedMeal(id);
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rows, loading, refetch, create, update, remove };
}
