import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getSavedMeals, addSavedMeal, updateSavedMeal, setSavedMealShared, setSavedMealFavourite, deleteSavedMeal, recipeExtrasSupported, getRecentRecipeLogs } from '../lib/db';

// Recipes — named bundles of ingredients that log as one action, e.g.
// "My usual breakfast" = oats + banana + honey, makes 1 serving.
export function useSavedMeals() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Photos, tags and prep time need a SQL update; until it's run they stay hidden.
  const [extrasSupported, setExtrasSupported] = useState(false);
  // Recently logged recipes, for the Featured card.
  const [recentLogs, setRecentLogs] = useState([]);

  const refetch = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getSavedMeals(user.id);
      setRows(data);
      setExtrasSupported(data.length ? 'tags' in data[0] : await recipeExtrasSupported());
      getRecentRecipeLogs(user.id).then(setRecentLogs).catch(() => setRecentLogs([]));
    } catch (err) {
      console.error("Failed to load saved meals:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (name, items, servings = 1, extras = {}) => {
    if (!user) return;
    const created = await addSavedMeal(user.id, name, items, servings, extras);
    setRows(prev => [created, ...prev]);
    return created;
  }, [user]);

  const update = useCallback(async (id, changes) => {
    const updated = await updateSavedMeal(id, changes);
    setRows(prev => prev.map(r => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const setShared = useCallback(async (id, shared) => {
    const updated = await setSavedMealShared(id, shared);
    setRows(prev => prev.map(r => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const setFavourite = useCallback(async (id, favourite) => {
    // Optimistic: the heart should answer the tap, and roll back if the save fails.
    setRows(prev => prev.map(r => (r.id === id ? { ...r, favourite } : r)));
    try {
      await setSavedMealFavourite(id, favourite);
    } catch (err) {
      setRows(prev => prev.map(r => (r.id === id ? { ...r, favourite: !favourite } : r)));
      throw err;
    }
  }, []);

  const remove = useCallback(async (id) => {
    await deleteSavedMeal(id);
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rows, loading, refetch, create, update, setShared, setFavourite, remove, extrasSupported, recentLogs };
}
