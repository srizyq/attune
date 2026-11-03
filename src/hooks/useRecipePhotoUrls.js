import { useEffect, useState } from 'react';
import { getRecipePhotoUrls } from '../lib/recipePhoto';

// Signed links last an hour; keep them for 45 minutes so a screen that is open
// for a while never shows a broken image, and the same photo isn't re-signed
// every time a list re-renders.
const TTL_MS = 45 * 60 * 1000;
const cache = new Map(); // path -> { url, at }

const fresh = (path) => { const e = cache.get(path); return e && Date.now() - e.at < TTL_MS ? e.url : null; };

// { [path]: url } for the given recipe photo paths (own recipes or a friend's shared ones).
export function useRecipePhotoUrls(paths) {
  const key = [...new Set((paths || []).filter(Boolean))].sort().join('|');
  const [, bump] = useState(0);

  useEffect(() => {
    const need = key ? key.split('|').filter((p) => !fresh(p)) : [];
    if (!need.length) return undefined;
    let cancelled = false;
    getRecipePhotoUrls(need)
      .then((urls) => {
        const at = Date.now();
        for (const [p, url] of Object.entries(urls)) cache.set(p, { url, at });
        if (!cancelled) bump((n) => n + 1);
      })
      .catch(() => { /* no photo shown; the recipe still works */ });
    return () => { cancelled = true; };
  }, [key]);

  const out = {};
  for (const p of key ? key.split('|') : []) { const url = fresh(p); if (url) out[p] = url; }
  return out;
}
