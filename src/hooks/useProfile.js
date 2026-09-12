import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, upsertProfile } from '../lib/db';

// These accounts always read with the listed fields forced on,
// regardless of what's actually stored — a permanent comp override
// rather than a one-off database edit, so it isn't undone by a future
// profile save and keeps working unchanged now that real Stripe billing
// writes these same fields for everyone else. Per-account grants (not
// one flat list) since not every comp account gets the same access —
// e.g. Pro only, without Coach Pass.
const COMP_GRANTS = {
  'csrreddy9@gmail.com': { is_premium: true, coach_pass: true },
  'sriramreddy1m@gmail.com': { is_premium: true, coach_pass: true },
  'nalywas@gmail.com': { is_premium: true },
  'tarunbalaji0901@gmail.com': { is_premium: true },
};

function withComp(data, email) {
  const grants = data && email && COMP_GRANTS[email.toLowerCase()];
  return grants ? { ...data, ...grants } : data;
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
