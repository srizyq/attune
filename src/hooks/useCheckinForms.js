import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import {
  getCheckinForm, saveCheckinForm, deleteCheckinForm, getCheckinResponses, getMyCheckinForms, submitCheckinResponse,
} from '../lib/db';

// Coach side: one client's check-in form and the answers they've given.
export function useCheckinFormAdmin(clientId) {
  const { user } = useAuth();
  const [state, setState] = useState({ supported: true, form: null, responses: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !clientId) { setState({ supported: true, form: null, responses: [] }); setLoading(false); return; }
    try {
      const [{ supported, form }, resp] = await Promise.all([getCheckinForm(user.id, clientId), getCheckinResponses(clientId)]);
      setState({ supported, form, responses: resp.rows });
    } catch (err) {
      console.error('Failed to load check-in form:', err);
    } finally {
      setLoading(false);
    }
  }, [user, clientId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const save = useCallback(async (fields) => {
    const form = await saveCheckinForm(user.id, clientId, fields);
    await refetch();
    return form;
  }, [user, clientId, refetch]);

  const remove = useCallback(async (id) => {
    await deleteCheckinForm(id);
    await refetch();
  }, [refetch]);

  return { ...state, loading, save, remove };
}

// Client side: the check-ins their coach has asked for.
export function useMyCheckinForms() {
  const { user } = useAuth();
  const [state, setState] = useState({ supported: true, forms: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setState({ supported: true, forms: [] }); setLoading(false); return; }
    try {
      setState(await getMyCheckinForms());
    } catch (err) {
      console.error('Failed to load check-in forms:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const submit = useCallback(async (formId, answers) => {
    await submitCheckinResponse(formId, answers);
    await refetch();
  }, [refetch]);

  return { ...state, loading, submit };
}
