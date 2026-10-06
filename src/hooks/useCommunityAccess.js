import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { hasCommunityAccess } from '../lib/community';

// Whether Community is switched on for this person. Asked once per signed-in
// user and remembered, because the bottom nav on every page needs the answer.
// While it's loading (or if it fails) the answer is "no", so the nav simply
// stays as it was.
const known = new Map(); // user id -> boolean
const inflight = new Map(); // user id -> Promise<boolean>

export function resetCommunityAccess() { known.clear(); inflight.clear(); }

export function useCommunityAccess() {
  const { user } = useAuth();
  const id = user?.id || null;
  const [state, setState] = useState(() => ({ id, ready: !!id && known.has(id), enabled: (!!id && known.get(id)) || false }));

  useEffect(() => {
    if (!id) { setState({ id: null, ready: false, enabled: false }); return undefined; }
    if (known.has(id)) { setState({ id, ready: true, enabled: known.get(id) }); return undefined; }
    let cancelled = false;
    if (!inflight.has(id)) {
      inflight.set(id, hasCommunityAccess().catch(() => false).then((v) => { known.set(id, v); inflight.delete(id); return v; }));
    }
    inflight.get(id).then((v) => { if (!cancelled) setState({ id, ready: true, enabled: v }); });
    return () => { cancelled = true; };
  }, [id]);

  // `ready` is false until the answer is in, so a page can tell "switched off"
  // from "still asking".
  return { enabled: state.enabled, ready: state.ready };
}
