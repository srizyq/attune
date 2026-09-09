import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import {
  getMyClients, getMyTrainers, redeemCoachInviteCode, revokeClientLink, setClientGroup,
  getTrainerComments, addTrainerComment, deleteTrainerComment, getLatestCoachComment,
  getGeneralThread, addClientReply,
  getFoodLogsForDate,
} from '../lib/db';
import { mapRow } from './useFoodLogs';

export function useMyClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setClients([]); setLoading(false); return; }
    setLoading(true);
    try {
      setClients(await getMyClients(user.id));
    } catch (err) {
      console.error('Failed to load clients:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const redeemCode = useCallback(async (code) => {
    await redeemCoachInviteCode(code);
    await refetch();
  }, [refetch]);

  const revoke = useCallback(async (trainerClientRowId) => {
    await revokeClientLink(trainerClientRowId);
    await refetch();
  }, [refetch]);

  const setGroup = useCallback(async (trainerClientRowId, label) => {
    await setClientGroup(trainerClientRowId, label);
    await refetch();
  }, [refetch]);

  return { clients, loading, refetch, redeemCode, revoke, setGroup };
}

export function useMyTrainers() {
  const { user } = useAuth();
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setTrainers([]); setLoading(false); return; }
    setLoading(true);
    try {
      setTrainers(await getMyTrainers(user.id));
    } catch (err) {
      console.error('Failed to load trainers:', err);
      setTrainers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const redeemCode = useCallback(async (code) => {
    await redeemCoachInviteCode(code);
    await refetch();
  }, [refetch]);

  const disconnect = useCallback(async (trainerClientRowId) => {
    await revokeClientLink(trainerClientRowId);
    await refetch();
  }, [refetch]);

  return { trainers, loading, refetch, redeemCode, disconnect };
}

// Read-only mirror of useFoodLogs, scoped to a specific client rather than
// the signed-in user — Coach Mode never adds/edits/deletes a client's food.
export function useClientFoodLogs(clientId, date) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!clientId || !date) { setLogs([]); setLoading(false); return; }
    setLoading(true);
    try {
      setLogs(await getFoodLogsForDate(clientId, date));
    } catch (err) {
      console.error('Failed to load client food logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, date]);

  useEffect(() => { refetch(); }, [refetch]);

  const items = useMemo(() => logs.map(mapRow), [logs]);
  const meals = useMemo(() => {
    const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) {
      const key = item.meal in grouped ? item.meal : 'snacks';
      grouped[key].push(item);
    }
    return grouped;
  }, [items]);

  return { items, meals, loading };
}

export function useTrainerComments(clientId) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !clientId) { setComments([]); setLoading(false); return; }
    setLoading(true);
    try {
      setComments(await getTrainerComments(user.id, clientId));
    } catch (err) {
      console.error('Failed to load comments:', err);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [user, clientId]);

  useEffect(() => { refetch(); }, [refetch]);

  const addComment = useCallback(async (body, commentDate = null, category = 'general') => {
    if (!user || !clientId) return;
    await addTrainerComment(user.id, clientId, body, commentDate, category);
    await refetch();
  }, [user, clientId, refetch]);

  const removeComment = useCallback(async (id) => {
    await deleteTrainerComment(id);
    await refetch();
  }, [refetch]);

  return { comments, loading, addComment, removeComment };
}

// Client-side: the signed-in user's own most recent coach comment in one
// category, for surfacing on their own Dashboard/Progress/Daily Log —
// `date` (Daily Log's nutrition notes) matches that exact day; omitted
// (weight/general) just returns the latest ever in that category.
export function useCoachNote(category, date = null) {
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setNote(null); setLoading(false); return; }
    setLoading(true);
    setDismissed(false);
    getLatestCoachComment(user.id, category, date)
      .then(result => { if (!cancelled) setNote(result); })
      .catch(err => { console.error('Failed to load coach note:', err); if (!cancelled) setNote(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, category, date]);

  return { note: dismissed ? null : note, loading, dismiss: () => setDismissed(true) };
}

// Client-side: the full two-way 'general' thread with one trainer, for
// the chat modal a Dashboard coach-note tab opens into.
export function useGeneralThread(trainerId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !trainerId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    try {
      setMessages(await getGeneralThread(user.id, trainerId));
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user, trainerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const sendReply = useCallback(async (body) => {
    if (!user || !trainerId) return;
    await addClientReply(user.id, trainerId, body);
    await refetch();
  }, [user, trainerId, refetch]);

  return { messages, loading, sendReply, refetch };
}
