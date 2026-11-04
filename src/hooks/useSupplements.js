import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getSupplements, addSupplement, deleteSupplement } from '../lib/db';
import { isMissingTableError } from '../lib/dbErrors';

// The person's saved supplements. `supported` is false until the supplements
// SQL update has been run, so the app can hide the feature rather than error.
export function useSupplements() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [supported, setSupported] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setRows([]); return; }
    try {
      setRows(await getSupplements(user.id));
      setSupported(true);
    } catch (err) {
      if (isMissingTableError(err)) setSupported(false);
      else console.error('Failed to load supplements:', err);
      setRows([]);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (supplement) => {
    if (!user) return;
    await addSupplement(user.id, supplement);
    await refetch();
  }, [user, refetch]);

  const remove = useCallback(async (id) => {
    await deleteSupplement(id);
    await refetch();
  }, [refetch]);

  return { supplements: rows, supported, create, remove };
}
