import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, upsertProfile } from '../lib/db';

// Owner's own account always reads as Pro, regardless of what's actually
// stored — a permanent comp account rather than a one-off database edit,
// so it isn't undone by a future profile save and keeps working
// unchanged once real Stripe billing starts writing is_premium for
// everyone else.
const COMP_EMAILS = new Set(['csrreddy9@gmail.com']);

function withComp(data, email) {
  return data && email && COMP_EMAILS.has(email) ? { ...data, is_premium: true } : data;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const data = await getProfile(user.id);
    setProfile(withComp(data, user.email));
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const save = useCallback(async (fields) => {
    if (!user) return;
    const updated = await upsertProfile(user.id, fields);
    const withOverride = withComp(updated, user.email);
    setProfile(withOverride);
    return withOverride;
  }, [user]);

  return { profile, loading, save, refetch };
}
