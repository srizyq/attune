import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import {
  getMyTeam, createCoachTeam, createTeamInvite, revokeTeamInvite, redeemTeamInvite,
  leaveCoachTeam, removeTeamMember, deleteCoachTeam, getClientCoaches, shareClientWithTeammate,
} from '../lib/db';

// The signed-in practitioner's team (see supabase/schema.sql, "Coach teams").
// `supported` is false until that SQL update has been run — the UI hides then.
// Every action refetches so the screen always shows what the database says.
export function useTeam() {
  const { user } = useAuth();
  const [state, setState] = useState({ supported: true, team: null });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setState({ supported: true, team: null }); setLoading(false); return; }
    try {
      setState(await getMyTeam());
    } catch (err) {
      console.error('Failed to load team:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const run = useCallback((fn) => async (...args) => {
    const result = await fn(...args);
    await refetch();
    return result;
  }, [refetch]);

  return {
    ...state, loading, refetch,
    create: run(createCoachTeam),
    join: run(redeemTeamInvite),
    leave: run(leaveCoachTeam),
    remove: run(removeTeamMember),
    disband: run(deleteCoachTeam),
    invite: run(createTeamInvite),
    revokeInvite: run(revokeTeamInvite),
  };
}

// The teammates already coaching one client, and bringing another in.
export function useClientCoaches(clientId) {
  const [state, setState] = useState({ supported: true, coaches: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!clientId) { setState({ supported: true, coaches: [] }); setLoading(false); return; }
    try {
      setState(await getClientCoaches(clientId));
    } catch (err) {
      console.error('Failed to load co-coaches:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const share = useCallback(async (teammateId) => {
    await shareClientWithTeammate(clientId, teammateId);
    await refetch();
  }, [clientId, refetch]);

  return { ...state, loading, refetch, share };
}
