import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { getFoodLogsForRange } from '../lib/db';
import { mapRow } from './useFoodLogs';
import { rangeDates } from '../lib/nutrientRange';

/**
 * Every logged item over the `days` days ending on `end`, in the app's item
 * shape (with loggedDate), plus the list of dates. Does nothing (and reports
 * not loading) when `enabled` is false, so a single-day view never fetches a month.
 */
export function useFoodLogsRange(end, days, enabled) {
  const { user } = useAuth();
  const dates = useMemo(() => rangeDates(end, days), [end, days]);
  const [state, setState] = useState({ key: '', rows: [] });
  const key = enabled && user ? `${user.id}|${dates[0]}|${end}` : '';

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    getFoodLogsForRange(user.id, dates[0], end)
      .then((rows) => { if (!cancelled) setState({ key, rows }); })
      .catch((err) => { console.error('Failed to load food logs for range:', err); if (!cancelled) setState({ key, rows: [] }); });
    return () => { cancelled = true; };
    // `key` stands for user, start and end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const items = useMemo(() => (key && state.key === key ? state.rows.map(mapRow) : []), [key, state]);
  return { items, dates, loading: !!key && state.key !== key };
}
