import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, upsertProfile } from '../lib/db';
import { withCompGrants } from '../lib/compGrants';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const data = await getProfile(user.id);
    setProfile(withCompGrants(data, user.email));
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const save = useCallback(async (fields) => {
    if (!user) return;
    const updated = await upsertProfile(user.id, fields);
    const withOverride = withCompGrants(updated, user.email);
    setProfile(withOverride);
    return withOverride;
  }, [user]);

  return { profile, loading, save, refetch };
}
