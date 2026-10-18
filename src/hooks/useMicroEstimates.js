import { useEffect, useMemo, useState } from 'react';
import { searchAusnutStrict } from '../lib/db';
import { cachedSearch, estimateItem, estimateItems, missingKeys } from '../lib/microEstimate';

const EMPTY = new Map();
// One shared cache, so moving between days (or back to one) doesn't repeat lookups.
const search = cachedSearch(searchAusnutStrict);

/**
 * Estimated vitamins and minerals for the logged items that came without any:
 * Map(item id → { micros, from }). Empty until the lookups finish, and empty
 * if they fail — the page then just shows what was measured.
 */
export function useMicroEstimates(items) {
  const needing = useMemo(() => (items || []).filter((i) => Number(i.cal) > 0 && missingKeys(i).length > 0), [items]);
  const key = needing.map((i) => `${i.id}|${i.name}|${i.servingGrams}|${i.cal}|${i.ingredients?.length || 0}`).join('~');
  const [state, setState] = useState({ key: '', estimates: EMPTY });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    estimateItems(needing, search).then((estimates) => { if (!cancelled) setState({ key, estimates }); });
    return () => { cancelled = true; };
    // `needing` is derived from `key`; re-running on the key is what's wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && state.key === key ? state.estimates : EMPTY;
}

/**
 * The same kind of estimate for one food (a search result, a scan, a logged
 * item): { micros, from } once found, or null while looking / when nothing similar exists.
 */
export function useFoodEstimate(food) {
  const needs = !!food && Number(food.cal) > 0 && missingKeys(food).length > 0;
  const key = needs ? `${food.name}|${food.brand || ''}|${food.servingGrams}|${food.cal}|${food.ingredients?.length || 0}` : '';
  const [state, setState] = useState({ key: '', estimate: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    estimateItem(food, search)
      .then((estimate) => { if (!cancelled) setState({ key, estimate }); })
      .catch(() => { if (!cancelled) setState({ key, estimate: null }); });
    return () => { cancelled = true; };
    // `food` is represented by `key`; re-running on the key is what's wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && state.key === key ? state.estimate : null;
}
