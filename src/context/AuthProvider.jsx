import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // getUser() reports live server state, but — unlike refreshSession() —
  // never updates the cached session or reissues its JWT, and is_anonymous
  // is baked into that JWT at issuance. So confirming an email in a
  // different tab/device (the common case — see Step5's own comment)
  // never reaches an already-open session on its own: getUser() would see
  // the real, confirmed account, but nothing here would know to act on
  // it. Re-checked automatically whenever the tab regains focus while
  // still pending confirmation, so coming back after clicking the emailed
  // link elsewhere "just works" without a manual reload — same check is
  // exposed below for ConfirmEmailBanner's "I've confirmed" button.
  useEffect(() => {
    async function recheckIfPending() {
      if (document.visibilityState !== 'visible') return;
      const current = sessionRef.current;
      if (!current?.user?.is_anonymous || !current?.user?.new_email) return;
      const { data: { user: liveUser } } = await supabase.auth.getUser();
      if (liveUser && !liveUser.is_anonymous) await supabase.auth.refreshSession();
    }
    document.addEventListener('visibilitychange', recheckIfPending);
    return () => document.removeEventListener('visibilitychange', recheckIfPending);
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signOut: () => supabase.auth.signOut(),
    // Manual version of the same check — returns whether it actually
    // found and applied a real confirmation, so the caller can show
    // "still not confirmed" instead of silently doing nothing.
    checkEmailConfirmed: async () => {
      const { data: { user: liveUser } } = await supabase.auth.getUser();
      if (liveUser && !liveUser.is_anonymous) {
        await supabase.auth.refreshSession();
        return true;
      }
      return false;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
