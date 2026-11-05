import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, upsertProfile } from '../lib/db';
import { withCompGrants } from '../lib/compGrants';
import { withTrial } from '../lib/trial';
import { rememberCoachNav } from '../lib/coachNav';
import { ProfileContext } from '../context/profileContext';

// A profile this fresh is trusted as-is when a screen opens; older than this and
// it is quietly re-checked in the background (never blocking what's on screen).
export const PROFILE_STALE_MS = 30_000;

// The profile's state and its load/save, in one place. ProfileProvider runs it
// once for the whole app so every screen shares the same profile: opening
// Settings (or any other page) no longer fetches it again and waits on a
// spinner, and a save made on one screen shows on all of them. Without a
// provider (a hook rendered on its own, as in tests) useProfile runs its own copy.
export function useProfileState(enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  const email = user?.email;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const profileRef = useRef(null);
  const inflight = useRef(null);
  const fetchedAt = useRef(0);
  const ownerRef = useRef(uid);

  const apply = useCallback((next) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  const refetch = useCallback(() => {
    if (!enabled) return Promise.resolve();
    if (!uid) { apply(null); setLoading(false); return Promise.resolve(); }
    if (inflight.current) return inflight.current;
    // Only the very first load shows as loading; later refreshes happen behind
    // the profile already on screen.
    if (!profileRef.current) setLoading(true);
    const run = (async () => {
      // Unhandled before — a network blip here left loading stuck true
      // forever (see useCustomFoods for the same fix applied consistently
      // across the data hooks). Especially costly on this hook specifically,
      // since so much of the app gates rendering on profile/loading.
      try {
        const data = await getProfile(uid);
        const loaded = withCompGrants(withTrial(data), email);
        rememberCoachNav(loaded);
        apply(loaded);
      } catch (err) {
        console.error('Failed to load profile:', err);
        if (!profileRef.current) apply(null); // a profile already held stays rather than blanking
      } finally {
        fetchedAt.current = Date.now();
        inflight.current = null;
        setLoading(false);
      }
    })();
    inflight.current = run;
    return run;
  }, [enabled, uid, email, apply]);

  // A different account signing in must never see the previous one's profile.
  useEffect(() => {
    if (ownerRef.current !== uid) {
      ownerRef.current = uid;
      fetchedAt.current = 0;
      inflight.current = null;
      apply(null);
    }
    refetch();
  }, [uid, refetch, apply]);

  const revalidate = useCallback(() => {
    if (Date.now() - fetchedAt.current > PROFILE_STALE_MS) return refetch();
    return Promise.resolve();
  }, [refetch]);

  const save = useCallback(async (fields) => {
    if (!uid) return;
    const updated = await upsertProfile(uid, fields);
    const withOverride = withCompGrants(withTrial(updated), email);
    rememberCoachNav(withOverride);
    apply(withOverride);
    fetchedAt.current = Date.now();
    return withOverride;
  }, [uid, email, apply]);

  return { profile, loading, save, refetch, revalidate };
}

export function useProfile() {
  const shared = useContext(ProfileContext);
  const own = useProfileState(!shared);
  const current = shared || own;
  const { revalidate } = current;
  // Opening a screen re-checks a profile that has gone stale, in the background.
  useEffect(() => { if (shared) revalidate(); }, [shared, revalidate]);
  return { profile: current.profile, loading: current.loading, save: current.save, refetch: current.refetch };
}
