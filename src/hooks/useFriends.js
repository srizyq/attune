import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getMyFriendInfo, listFriends, getHiddenDays, setSharing, setShareLevel, setDayHidden } from '../lib/friends';

/**
 * Everything the Friends tab needs for one day: your invite code, how much of
 * your day you share (and whether you've hidden this one), and your friends with
 * their totals. `error` is set when the lists couldn't be loaded.
 */
export function useFriends(day) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, friends: [], code: null, shareDay: true, shareLevel: 'full', levelsSupported: false, dayHidden: false });

  const refetch = useCallback(async () => {
    if (!user || !day) return;
    try {
      const [info, friends, hidden] = await Promise.all([getMyFriendInfo(), listFriends(day), getHiddenDays(day, day)]);
      setState({ loading: false, error: null, friends, code: info.code, shareDay: info.shareDay, shareLevel: info.shareLevel, levelsSupported: info.levelsSupported, dayHidden: hidden.length > 0 });
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

  // Full meals / Totals only / Private. Before the database update only on/off exists, so Private maps to off.
  const changeLevel = useCallback(async (level) => {
    setState((s) => ({ ...s, shareLevel: level, shareDay: level !== 'private' }));
    try { await (state.levelsSupported ? setShareLevel(level) : setSharing(level !== 'private')); } catch (err) { await refetch(); throw err; }
  }, [refetch, state.levelsSupported]);

  const changeDayHidden = useCallback(async (hidden) => {
    setState((s) => ({ ...s, dayHidden: hidden }));
    try { await setDayHidden(day, hidden); } catch (err) { await refetch(); throw err; }
  }, [day, refetch]);

  return { ...state, refetch, changeSharing, changeLevel, changeDayHidden };
}
