import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { recheckPending } from '../lib/communityPhotos';
import { getMyCommunityProfile, joinCommunity, leaveCommunity, updateCommunityProfile } from '../lib/community';

// The signed-in person's own Community profile (null until they've joined).
// `enabled` is false while Community is switched off: nothing is asked then.
// `loading` stays true until the first answer for this person arrives, so a
// screen never briefly shows "Join" to someone who already has.
export function useCommunity({ enabled = true } = {}) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState({ me: null, forUser: null, error: null });
  const loading = !!userId && enabled && state.forUser !== userId;

  const refetch = useCallback(async () => {
    if (!userId || !enabled) return;
    try {
      const me = await getMyCommunityProfile(userId);
      setState({ me, forUser: userId, error: null });
    } catch (err) {
      console.error('Failed to load Community profile:', err);
      setState({ me: null, forUser: userId, error: err });
    }
  }, [userId, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  // A profile picture whose check failed last time: try again.
  const avatarPath = state.me?.avatar_status === 'pending' ? state.me.avatar_path : null;
  useEffect(() => {
    if (!avatarPath) return;
    recheckPending({ kind: 'avatar', path: avatarPath }).then((status) => {
      if (status) setState((s) => (s.me?.avatar_path === avatarPath ? { ...s, me: { ...s.me, avatar_status: status } } : s));
    });
  }, [avatarPath]);

  const join = useCallback(async (fields) => {
    const created = await joinCommunity(userId, fields);
    setState({ me: created, forUser: userId, error: null });
    return created;
  }, [userId]);

  const update = useCallback(async (fields) => {
    const updated = await updateCommunityProfile(userId, fields);
    setState({ me: updated, forUser: userId, error: null });
    return updated;
  }, [userId]);

  const leave = useCallback(async () => {
    await leaveCommunity(userId);
    setState({ me: null, forUser: userId, error: null });
  }, [userId]);

  const me = state.forUser === userId ? state.me : null;
  return { me, loading, error: state.error, join, update, leave, refetch };
}
