import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, upsertProfile } from '../lib/db';
import { withCompGrants } from '../lib/compGrants';
import { withTrial } from '../lib/trial';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    // Unhandled before — a network blip here left loading stuck true
    // forever (see useCustomFoods for the same fix applied consistently
    // across the data hooks). Especially costly on this hook specifically,
    // since so much of the app gates rendering on profile/loading.
    try {
      const data = await getProfile(user.id);
      setProfile(withCompGrants(withTrial(data), user.email));
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const save = useCallback(async (fields) => {
    if (!user) return;
    const updated = await upsertProfile(user.id, fields);
    const withOverride = withCompGrants(withTrial(updated), user.email);
    setProfile(withOverride);
    return withOverride;
  }, [user]);

  return { profile, loading, save, refetch };
}
