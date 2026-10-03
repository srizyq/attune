import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/http';

// The extras for a picked menu dish (portion sizes, quick tweaks, allergens,
// where on the photo it is) come from one extra, free request per dish
// (see api/_menuDetail.js) — fetched in the background so the confirm sheet
// is usable immediately and its rows fill in when this lands.

/**
 * Loads the extras for the picked dish. Re-fetches only when the dish itself
 * changes (a different pick, or a correction that re-estimated it); going
 * back and re-picking the same dish reuses what was already fetched.
 * `detail` stays null on failure — the rows just don't appear.
 */
export function useMenuPickDetail(preview, pick) {
  const [state, setState] = useState({ key: null, detail: null, failed: false });
  const cache = useRef(new Map());
  const key = pick ? `${pick.name}|${pick.cal}|${pick.protein}|${pick.carbs}|${pick.fat}` : null;
  const photo = preview;

  useEffect(() => {
    if (!key || !photo) return undefined;
    const cached = cache.current.get(key);
    if (cached) { setState({ key, detail: cached, failed: false }); return undefined; }

    let cancelled = false;
    setState({ key, detail: null, failed: false });
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetchWithTimeout('/api/recognize-menu', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ image: photo.split(',')[1], mediaType: 'image/jpeg', detail: true, pick }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'detail failed');
        cache.current.set(key, data);
        if (!cancelled) setState({ key, detail: data, failed: false });
      } catch (err) {
        console.error('Menu detail failed:', err);
        if (!cancelled) setState({ key, detail: null, failed: true });
      }
    })();
    return () => { cancelled = true; };
    // `pick` is covered by `key` (every field the request depends on is in it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, photo]);

  const current = state.key === key;
  return { detail: current ? state.detail : null, loading: !!key && (!current || (!state.detail && !state.failed)) };
}

