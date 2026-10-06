import { useEffect, useState } from 'react';
import { getPhotoUrl } from '../lib/communityPhotos';

/** The link to show a Community photo, or null while loading / when there's no photo. */
export function useSignedPhotoUrl(path) {
  const [state, setState] = useState({ path: null, url: null });
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    getPhotoUrl(path).then((url) => { if (!cancelled) setState({ path, url }); });
    return () => { cancelled = true; };
  }, [path]);
  return path && state.path === path ? state.url : null;
}
