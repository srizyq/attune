import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import {
  getMyClients, getMyTrainers, redeemCoachInviteCode, revokeClientLink, setClientGroup,
  respondToCoachLink, getMyInvites, createCoachInvite, revokeCoachInvite, getPendingClients,
  getClientSummaries, getTrainerNotes, addTrainerNote, updateTrainerNote, deleteTrainerNote, getWorkoutLogsForRange,
  getTrainerComments, addTrainerComment, deleteTrainerComment, getLatestCoachComment,
  getGeneralThread, addClientReply,
  getFoodLogsForDate,
} from '../lib/db';
import { extractInviteCode } from '../lib/coachInvite';
import { mapRow } from './useFoodLogs';

export function useMyClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // `silent` skips the loading flag for background refreshes (returning to
  // the tab after a client accepted an invite), so the list doesn't blink.
  const refetch = useCallback(async ({ silent = false } = {}) => {
    if (!user) { setClients([]); setLoading(false); return; }
    if (!silent) setLoading(true);
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

  // Accepts a bare code or a whole pasted invite link.
  const redeemCode = useCallback(async (codeOrLink) => {
    await redeemCoachInviteCode(extractInviteCode(codeOrLink));
    await refetch();
  }, [refetch]);

  const disconnect = useCallback(async (trainerClientRowId) => {
    await revokeClientLink(trainerClientRowId);
    await refetch();
  }, [refetch]);

  // The client's consent decision: accept a pending invitation (or confirm
  // the notice on a connection that predates consent), or decline it.
  const respond = useCallback(async (linkId, accept) => {
    await respondToCoachLink(linkId, accept);
    await refetch();
  }, [refetch]);

  // Pending invitations awaiting an answer, active links, and the subset of
  // active links that predate consent and still need the one-time notice.
  const pending = useMemo(() => trainers.filter(t => t.status === 'pending'), [trainers]);
  const active = useMemo(() => trainers.filter(t => t.status === 'active'), [trainers]);
  const needsNotice = useMemo(() => active.filter(t => !t.consented_at), [active]);

  return { trainers, active, pending, needsNotice, loading, refetch, redeemCode, disconnect, respond };
}

// Trainer-side: per-client invites (single-use, expiring) plus the clients
// who've redeemed one and are waiting to be accepted on the other side.
// `supported` is false when the invites table doesn't exist yet (app deployed
// before the migration was run), so the UI can fall back to the old shared
// code instead of showing a broken panel.
export function useCoachInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [pending, setPending] = useState([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setInvites([]); setPending([]); setLoading(false); return; }
    try {
      const [inv, pend] = await Promise.all([getMyInvites(user.id), getPendingClients()]);
      setSupported(inv !== null);
      setInvites(inv || []);
      setPending(pend);
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (label, days) => {
    const row = await createCoachInvite(label, days);
    await refetch();
    return row;
  }, [refetch]);

  const revoke = useCallback(async (inviteId) => {
    await revokeCoachInvite(inviteId);
    await refetch();
  }, [refetch]);

  return { invites, pending, supported, loading, refetch, create, revoke };
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
    // Best-effort — a failed push send shouldn't surface as a failure to
    // save the comment itself, which already succeeded above.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch('/api/notify-trainer-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ clientId }),
        });
      }
    } catch (err) {
      console.error('Failed to notify client of new comment:', err);
    }
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
// Which note (by its own row id) was last dismissed for this user+category
// — persisted so a dismissal survives reloads and remounts, and so a new
// comment from the coach (a different id) shows up again regardless of an
// old dismissal. Component state alone reset to "not dismissed" on every
// remount (navigating away from Dashboard and back, or a refresh), which
// made the X button on CoachNote look like it didn't do anything.
function dismissedNoteKey(userId, category) {
  return `attune_dismissed_coach_note_${userId}_${category}`;
}
function getDismissedNoteId(userId, category) {
  try { return localStorage.getItem(dismissedNoteKey(userId, category)); } catch { return null; }
}
function setDismissedNoteId(userId, category, noteId) {
  try { localStorage.setItem(dismissedNoteKey(userId, category), noteId); } catch { /* best-effort */ }
}

export function useCoachNote(category, date = null) {
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setNote(null); setLoading(false); return; }
    setLoading(true);
    getLatestCoachComment(user.id, category, date)
      .then(result => {
        if (cancelled) return;
        const dismissedId = getDismissedNoteId(user.id, category);
        setNote(result && String(result.id) === dismissedId ? null : result);
      })
      .catch(err => { console.error('Failed to load coach note:', err); if (!cancelled) setNote(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, category, date]);

  function dismiss() {
    if (user && note) setDismissedNoteId(user.id, category, String(note.id));
    setNote(null);
  }

  return { note, loading, dismiss };
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
    // Best-effort, same as the trainer->client note: a failed push must not
    // surface as a failed message, which already saved above. The server
    // opts the coach in/out and throttles bursts.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch('/api/notify-trainer-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ direction: 'to-trainer', trainerId }),
        });
      }
    } catch (err) {
      console.error('Failed to notify coach of reply:', err);
    }
  }, [user, trainerId, refetch]);

  return { messages, loading, sendReply, refetch };
}

// The trainer's client list, as one query (see get_client_summaries).
// `summaries` is null when that function isn't deployed yet, which tells the
// list to fall back to fetching each client's history itself. `today` is the
// trainer's own local date, since "logged today" is relative to them.
export function useClientSummaries(today) {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState(undefined); // undefined = not loaded yet
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async ({ silent = false } = {}) => {
    if (!user) { setSummaries([]); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      setSummaries(await getClientSummaries(today));
    } catch (err) {
      console.error('Failed to load client summaries:', err);
      setSummaries((prev) => (prev === undefined ? null : prev));
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => { refetch(); }, [refetch]);
  // Always an array: null (function not deployed yet) and undefined (not
  // loaded yet) both read as "no rows", and `supported` carries the difference.
  return { summaries: Array.isArray(summaries) ? summaries : [], supported: summaries !== null, loading, refetch };
}

// A trainer's private notes about one client — visible to no one else, not
// even that client. `supported` is false until the trainer_notes table exists.
export function useTrainerNotes(clientId) {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !clientId) { setNotes([]); setLoading(false); return; }
    try {
      const rows = await getTrainerNotes(user.id, clientId);
      setSupported(rows !== null);
      setNotes(rows || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  }, [user, clientId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const add = useCallback(async (body, noteDate = null) => {
    if (!user || !clientId) return;
    await addTrainerNote(user.id, clientId, body, noteDate);
    await refetch();
  }, [user, clientId, refetch]);

  const update = useCallback(async (id, patch) => {
    await updateTrainerNote(id, patch);
    await refetch();
  }, [refetch]);

  const remove = useCallback(async (id) => {
    await deleteTrainerNote(id);
    await refetch();
  }, [refetch]);

  return { notes, supported, loading, add, update, remove };
}

// A connected client's workouts over a date range, newest first. Read-only:
// a trainer can see them (workout_logs has a trainer read policy) but never
// write them.
export function useClientWorkouts(clientId, startDate, endDate) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!clientId || !startDate || !endDate) { setWorkouts([]); setLoading(false); return undefined; }
    setLoading(true);
    getWorkoutLogsForRange(clientId, startDate, endDate)
      .then((rows) => {
        if (cancelled) return;
        setWorkouts(rows
          .map((r) => ({
            id: r.id, date: r.logged_date, type: r.type, intensity: r.intensity,
            durationMinutes: Number(r.duration_minutes) || 0, caloriesBurned: Number(r.calories_burned) || 0,
          }))
          .sort((a, b) => b.date.localeCompare(a.date)));
      })
      .catch((err) => { console.error('Failed to load client workouts:', err); if (!cancelled) setWorkouts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, startDate, endDate]);

  return { workouts, loading };
}

