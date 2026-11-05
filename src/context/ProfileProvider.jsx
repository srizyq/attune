import { useEffect, useMemo } from 'react';
import { useProfileState } from '../hooks/useProfile';
import { ProfileContext } from './profileContext';

// One profile for the whole app (see useProfileState). Coming back to the app
// after a while re-checks it, so a change made elsewhere (a coach accepting
// someone, a payment going through) turns up without a reload.
export function ProfileProvider({ children }) {
  const state = useProfileState(true);
  const { profile, loading, save, refetch, revalidate } = state;
  const value = useMemo(() => ({ profile, loading, save, refetch, revalidate }), [profile, loading, save, refetch, revalidate]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') revalidate(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [revalidate]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
