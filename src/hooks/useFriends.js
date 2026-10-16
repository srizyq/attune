import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getMyFriendInfo, listFriends, getHiddenDays, setSharing, setDayHidden } from '../lib/friends';

/**
 * Everything the Friends tab needs for one day: your invite code, whether you
 * share your day (and whether you've hidden this one), and your friends with
 * their totals. `error` is set when the lists couldn't be loaded.
 */
export function useFriends(day) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, friends: [], code: null, shareDay: true, dayHidden: false });

  const refetch = useCallback(async () => {
    if (!user || !day) return;
    try {
      const [info, friends, hidden] = await Promise.all([getMyFriendInfo(), listFriends(day), getHiddenDays(day, day)]);
      setState({ loading: false, error: null, friends, code: info.code, shareDay: info.shareDay, dayHidden: hidden.length > 0 });
    } catch (error) {
      console.error('Failed to load friends:', error);
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [user, day]);

  useEffect(() => { refetch(); }, [refetch]);

  const changeSharing = useCallback(async (share) => {
    setState((s) => ({ ...s, shareDay: share }));
    try { await setSharing(share); } catch (err) { await refetch(); throw err; }
  }, [refetch]);

  const changeDayHidden = useCallback(async (hidden) => {
    setState((s) => ({ ...s, dayHidden: hidden }));
    try { await setDayHidden(day, hidden); } catch (err) { await refetch(); throw err; }
  }, [day, refetch]);

  return { ...state, refetch, changeSharing, changeDayHidden };
}
