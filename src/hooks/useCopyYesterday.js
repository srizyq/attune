import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { getFoodLogsForDate, copyFoodLogs, deleteFoodLog } from '../lib/db';
import { todayLocalDate } from '../lib/patterns';

const MEAL_LABELS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snacks' };

// The day before `date` ("yesterday" relative to whichever day is being
// viewed): its raw rows grouped by meal, plus copy(mealKey?) to re-log one
// meal (or, with no key, the whole day) onto `date`. copyFoodLogs only
// inserts new rows, so Undo is just deleting exactly the rows it created.
export function useCopyYesterday(date, refetch, showToast) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [copying, setCopying] = useState(false);
  const copyingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setRows([]);
    getFoodLogsForDate(user.id, todayLocalDate(d))
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, date]);

  const byMeal = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  for (const r of rows) (byMeal[r.meal] || byMeal.snacks).push(r);

  const copy = useCallback(async (mealKey = null) => {
    if (!user || copyingRef.current) return;
    const toCopy = mealKey ? rows.filter(r => (r.meal in MEAL_LABELS ? r.meal : 'snacks') === mealKey) : rows;
    if (!toCopy.length) {
      showToast(mealKey ? `No ${MEAL_LABELS[mealKey]} logged yesterday` : 'Nothing logged yesterday', true);
      return;
    }
    copyingRef.current = true;
    setCopying(true);
    try {
      const created = await copyFoodLogs(user.id, toCopy, date);
      await refetch();
      showToast(`Copied ${created.length} item${created.length === 1 ? '' : 's'} from yesterday`, false, {
        label: 'Undo',
        onClick: async () => {
          try {
            await Promise.all(created.map(r => deleteFoodLog(r.id)));
          } catch {
            showToast("Couldn't undo — try again", true);
          }
          await refetch();
        },
      });
    } catch {
      showToast("Couldn't copy — try again", true);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }, [user, rows, date, refetch, showToast]);

  return { byMeal, hasAny: rows.length > 0, copy, copying };
}
