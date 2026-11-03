import { supabase } from './supabase';
import { mapRow } from '../hooks/useFoodLogs';
import { isMissingFunctionError } from './coachInvite';

// Friends: people you add by sharing an invite link. A friend sees your
// calories, macros and food log for the day, and any recipes you've shared —
// nothing else. All of it goes through database functions (see the "Friends"
// block in supabase/schema.sql); nobody reads another person's tables directly.

const PENDING_KEY = 'attune_pending_friend';

/** Just the letters and digits of a code, upper-cased — people paste links with stray characters. */
export function normalizeFriendCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

export function friendLink(origin, code) {
  return `${String(origin).replace(/\/+$/, '')}/friends/join/${normalizeFriendCode(code)}`;
}

/** Up to two capital letters from a name, for the avatar circle. */
export function initialsOf(name) {
  const letters = String(name || '').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return letters || '?';
}

// A code from a link survives sign-up, the emailed confirmation (a different
// tab) and login in localStorage, then is picked up once the person is in.
export function stashPendingFriend(code) {
  const clean = normalizeFriendCode(code);
  if (!clean) return;
  try { localStorage.setItem(PENDING_KEY, clean); } catch { /* storage blocked — they can open the link again */ }
}

export function takePendingFriend() {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    if (code) localStorage.removeItem(PENDING_KEY);
    return code || null;
  } catch {
    return null;
  }
}

/** The database update hasn't been run yet (the app deployed first). */
export function friendsUnavailable(err) {
  return isMissingFunctionError(err);
}

export function friendlyFriendsError(err) {
  const msg = String(err?.message || '');
  if (friendsUnavailable(err)) return 'Friends isn\'t switched on yet. Try again later.';
  if (/friends_invalid_code/.test(msg)) return 'That invite link isn\'t valid any more. Ask your friend for a new one.';
  if (/friends_self/.test(msg)) return 'That\'s your own link. Send it to a friend instead.';
  if (/friends_not_friends/.test(msg)) return 'You aren\'t friends with that person any more.';
  if (/community_rate_limited/.test(msg)) return 'You\'ve done that a lot today. Try again tomorrow.';
  return 'Something went wrong. Try again.';
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// How much of your day friends see: everything you ate, only the day's numbers,
// or nothing. The older database only knew on/off, so `levelsSupported` is false
// until its update has been run and the page offers just Full and Private.
export const SHARE_LEVELS = [
  { id: 'full', label: 'Full meals', hint: 'Friends see your calories, macros and what you ate.' },
  { id: 'totals', label: 'Totals only', hint: 'Friends see your calories and macros, never what you ate.' },
  { id: 'private', label: 'Private', hint: 'Friends see nothing of your day.' },
];

/** Your invite code and how much of your day friends see. */
export async function getMyFriendInfo() {
  const rows = await rpc('friends_me');
  const row = Array.isArray(rows) ? rows[0] : rows;
  const levelsSupported = typeof row?.share_level === 'string';
  const shareLevel = levelsSupported ? row.share_level : row?.share_day === false ? 'private' : 'full';
  return { code: row?.invite_code ?? null, shareDay: shareLevel !== 'private', shareLevel, levelsSupported };
}

export const setSharing = (share) => rpc('friends_set_sharing', { p_share: !!share });
export const setShareLevel = (level) => rpc('friends_set_share_level', { p_level: level });
export const setDayHidden = (day, hidden) => rpc('friends_set_day_hidden', { p_day: day, p_hidden: !!hidden });
export async function getHiddenDays(from, to) {
  return (await rpc('friends_hidden_days', { p_from: from, p_to: to })) || [];
}

/** Who an invite link is from, or null when the code is unknown. */
export async function previewInvite(code) {
  const rows = await rpc('friends_preview', { p_code: normalizeFriendCode(code) });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { friendId: row.friend_id, name: row.name, already: !!row.already } : null;
}

export const addFriend = (code) => rpc('friends_add', { p_code: normalizeFriendCode(code) });
export const removeFriend = (friendId) => rpc('friends_remove', { p_friend: friendId });

const num = (v) => (v == null ? null : Number(v));

/** Your friends with their totals for one day, ready for cards. */
export async function listFriends(day) {
  const rows = (await rpc('friends_list', { p_day: day })) || [];
  return rows.map((r) => ({
    id: r.friend_id,
    name: r.name,
    hidden: !!r.hidden,
    // 'full' | 'totals' | 'none' — an older database has no level, so it is worked out from hidden.
    level: r.level || (r.hidden ? 'none' : 'full'),
    items: Number(r.items) || 0,
    totals: r.hidden ? null : { calories: num(r.calories) ?? 0, protein: num(r.protein_g) ?? 0, carbs: num(r.carbs_g) ?? 0, fat: num(r.fat_g) ?? 0 },
    targets: { calories: num(r.calorie_target), protein: num(r.protein_target), carbs: num(r.carbs_target), fat: num(r.fat_target) },
  }));
}

/** One friend's day: who, their targets, and their foods shaped like your own log entries. */
export async function getFriendDay(friendId, day) {
  const d = await rpc('friends_day', { p_friend: friendId, p_day: day });
  const t = d?.targets || {};
  const hidden = !!d?.hidden;
  const tot = d?.totals;
  return {
    id: friendId,
    name: d?.name || 'Friend',
    hidden,
    level: d?.level || (hidden ? 'none' : 'full'),
    // The day's numbers as the server added them up (what a "totals only" friend sees).
    totals: tot ? { calories: num(tot.calories) ?? 0, protein: num(tot.protein_g) ?? 0, carbs: num(tot.carbs_g) ?? 0, fat: num(tot.fat_g) ?? 0, items: Number(tot.items) || 0 } : null,
    targets: { calories: num(t.calories), protein: num(t.protein_g), carbs: num(t.carbs_g), fat: num(t.fat_g) },
    items: (d?.logs || []).map(mapRow),
  };
}

/** The recipes a friend has shared. */
export async function getFriendRecipes(friendId) {
  const rows = (await rpc('friends_recipes', { p_friend: friendId })) || [];
  return rows.map((r) => ({
    id: r.id, name: r.name, items: Array.isArray(r.items) ? r.items : [], servings: Number(r.servings) || 1,
    createdAt: r.created_at || null, photoPath: r.photo_path || null, prepMinutes: r.prep_minutes ?? null, tags: Array.isArray(r.tags) ? r.tags : [],
  }));
}

/** Every recipe your friends have shared, newest first, each with who shared it. A friend whose list fails to load is skipped. */
export async function getAllFriendRecipes(friends) {
  const lists = await Promise.all((friends || []).map(async (f) => {
    try { return (await getFriendRecipes(f.id)).map((r) => ({ ...r, friendId: f.id, friendName: f.name })); } catch { return []; }
  }));
  return lists.flat().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
