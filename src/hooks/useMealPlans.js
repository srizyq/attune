import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getMealPlan, saveMealPlan, deleteMealPlan, getMyMealPlans } from '../lib/db';

// Coach side: one client's meal plan.
export function useMealPlanAdmin(clientId) {
  const { user } = useAuth();
  const [state, setState] = useState({ supported: true, plan: null });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !clientId) { setState({ supported: true, plan: null }); setLoading(false); return; }
    try {
      setState(await getMealPlan(user.id, clientId));
    } catch (err) {
      console.error('Failed to load meal plan:', err);
    } finally {
      setLoading(false);
    }
  }, [user, clientId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const save = useCallback(async (fields) => {
    const plan = await saveMealPlan(user.id, clientId, fields);
    await refetch();
    return plan;
  }, [user, clientId, refetch]);

  const remove = useCallback(async (id) => {
    await deleteMealPlan(id);
    await refetch();
  }, [refetch]);

  return { ...state, loading, save, remove };
}

// Client side: the plans their coach(es) have set.
export function useMyMealPlans() {
  const { user } = useAuth();
  const [state, setState] = useState({ supported: true, plans: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setState({ supported: true, plans: [] }); setLoading(false); return; }
    try {
      setState(await getMyMealPlans());
    } catch (err) {
      console.error('Failed to load meal plans:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { ...state, loading, refetch };
}
