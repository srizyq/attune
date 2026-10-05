import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getRunningFast, getFinishedFasts, startFast, endFast, deleteFast } from '../lib/db';
import { isMissingTableError } from '../lib/dbErrors';

// The running fast (if any) plus recent finished ones. `unavailable` means the
// fasts table isn't in the database yet (app deployed before its SQL update),
// so the page can say so instead of showing a timer that can't save.
export function useFasting() {
  const { user } = useAuth();
  const userId = user?.id;
  const [running, setRunning] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) { setRunning(null); setHistory([]); setLoading(false); return; }
    try {
      const [current, finished] = await Promise.all([getRunningFast(userId), getFinishedFasts(userId)]);
      setRunning(current);
      setHistory(finished);
      setUnavailable(false);
    } catch (err) {
      if (isMissingTableError(err)) setUnavailable(true);
      else { console.error('Failed to load fasts:', err); setError("Couldn't load your fasts — check your connection and try again."); }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Every write: clear the old error, run it, and on failure show a message and
  // re-sync (another device may have started or ended a fast in the meantime).
  const act = useCallback(async (fn, failMessage) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error(failMessage, err);
      setError(failMessage);
    } finally {
      await refetch();
      setBusy(false);
    }
  }, [refetch]);

  const start = useCallback((targetHours) => act(() => startFast(userId, targetHours), "Couldn't start your fast — try again."), [act, userId]);
  const end = useCallback(() => act(() => endFast(running.id), "Couldn't end your fast — try again."), [act, running]);
  const discard = useCallback(() => act(() => deleteFast(running.id), "Couldn't discard that fast — try again."), [act, running]);

  return { running, history, loading, busy, error, unavailable, start, end, discard };
}
