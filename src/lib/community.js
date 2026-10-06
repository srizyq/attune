// Community's calls to Supabase. Reads go through the database's own
// functions (they apply the privacy rules); writes are plain inserts that row
// level security and triggers check again — nothing here is trusted on its own.
import { supabase } from './supabase';

const need = ({ data, error }) => { if (error) throw error; return data; };

// What the database says when a rule stops something, in words for people.
const MESSAGES = {
  community_too_young: 'Community is for people aged 16 and over.',
  community_age_required: 'Add your date of birth in Profile first so we can check you\'re 16 or over.',
  community_username_reserved: 'That username is reserved. Try another.',
  community_username_locked: 'You can change your username once every 30 days.',
  community_username_format: 'Use 3–20 letters, numbers, dots or underscores.',
  community_profiles_username_key: 'That username is taken. Try another.',
  community_bio_no_links: 'Links aren\'t allowed in a bio.',
  community_links_not_allowed: 'Links aren\'t allowed in notes.',
  community_rate_limited: 'You\'ve shared a lot today. Try again tomorrow.',
  community_blocked: 'You can\'t follow this person.',
  community_user_not_found: 'That account isn\'t available.',
  community_not_a_member: 'Join Community first.',
};

export function friendlyCommunityError(err) {
  const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
  for (const [key, message] of Object.entries(MESSAGES)) if (text.includes(key)) return message;
  if (/duplicate key/i.test(text) && /username/i.test(text)) return MESSAGES.community_profiles_username_key;
  return 'Something went wrong. Check your connection and try again.';
}

// ── Access ──────────────────────────────────────────────────────────────────
// Whether Community is switched on for this person (everyone, or a tester).
export async function hasCommunityAccess() {
  return !!need(await supabase.rpc('community_access'));
}

// ── My profile ──────────────────────────────────────────────────────────────
export async function getMyCommunityProfile(userId) {
  return need(await supabase.from('community_profiles').select('*').eq('user_id', userId).maybeSingle());
}

export async function joinCommunity(userId, { username, displayName, bio = '', isPrivate }) {
  return need(await supabase.from('community_profiles')
    .insert({ user_id: userId, username, display_name: displayName.trim(), bio: bio.trim(), is_private: !!isPrivate })
    .select('*').single());
}

export async function updateCommunityProfile(userId, fields) {
  return need(await supabase.from('community_profiles').update(fields).eq('user_id', userId).select('*').single());
}

export async function leaveCommunity(userId) {
  need(await supabase.from('community_posts').delete().eq('author_id', userId));
  need(await supabase.from('community_profiles').delete().eq('user_id', userId));
}

// ── Reading ─────────────────────────────────────────────────────────────────
export const getFeed = async (before = null, limit = 20) => need(await supabase.rpc('community_feed_cards', { p_limit: limit, p_before: before })) || [];
export const getUserPosts = async (userId, before = null, limit = 20) => need(await supabase.rpc('community_user_cards', { p_user: userId, p_limit: limit, p_before: before })) || [];
export const getSavedPosts = async (before = null, limit = 20) => need(await supabase.rpc('community_saved_cards', { p_limit: limit, p_before: before })) || [];
export const getProfileByUsername = async (username, today) => (need(await supabase.rpc('community_profile', { p_username: username, p_today: today })) || [])[0] || null;
export const searchPeople = async (q, limit = 20) => need(await supabase.rpc('community_search', { p_q: q, p_limit: limit })) || [];
export const explorePeople = async ({ sort = 'recent', goal = null, q = null, limit = 20, offset = 0 } = {}) =>
  need(await supabase.rpc('community_explore', { p_sort: sort, p_goal: goal, p_q: q, p_limit: limit, p_offset: offset })) || [];
export const getSuggestions = async (limit = 10) => need(await supabase.rpc('community_suggestions', { p_limit: limit })) || [];
export const getFollowRequests = async () => need(await supabase.rpc('community_follow_requests')) || [];
export const getFollowList = async (userId, kind) => need(await supabase.rpc('community_follow_list', { p_user: userId, p_kind: kind })) || [];

// ── Following ───────────────────────────────────────────────────────────────
export async function followUser(myId, theirId) {
  need(await supabase.from('community_follows').insert({ follower_id: myId, followee_id: theirId }));
}
export async function unfollowUser(myId, theirId) {
  need(await supabase.from('community_follows').delete().eq('follower_id', myId).eq('followee_id', theirId));
}
export async function approveFollower(myId, followerId) {
  need(await supabase.from('community_follows').update({ status: 'accepted' }).eq('followee_id', myId).eq('follower_id', followerId));
}
export async function declineFollower(myId, followerId) {
  need(await supabase.from('community_follows').delete().eq('followee_id', myId).eq('follower_id', followerId));
}

// ── Posts ───────────────────────────────────────────────────────────────────
export async function createPost(userId, { kind, payload, audience, note = '', photoPath = null }) {
  return need(await supabase.from('community_posts')
    .insert({ author_id: userId, kind, payload, audience, note: note.trim(), photo_path: photoPath })
    .select('id').single());
}
export async function updatePost(postId, fields) {
  need(await supabase.from('community_posts').update(fields).eq('id', postId));
}
export async function deletePost(postId) {
  need(await supabase.from('community_posts').delete().eq('id', postId));
}

// ── Reactions, saves, copies ────────────────────────────────────────────────
export async function setReaction(userId, postId, kind, on) {
  if (on) need(await supabase.from('community_reactions').insert({ post_id: postId, user_id: userId, kind }));
  else need(await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('kind', kind));
}
export async function setSaved(userId, postId, on) {
  if (on) need(await supabase.from('community_saves').upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true }));
  else need(await supabase.from('community_saves').delete().eq('user_id', userId).eq('post_id', postId));
}
export async function recordCopy(userId, postId) {
  need(await supabase.from('community_copies').upsert({ post_id: postId, copier_id: userId }, { onConflict: 'post_id,copier_id', ignoreDuplicates: true }));
}

// ── Safety ──────────────────────────────────────────────────────────────────
export async function blockUser(myId, theirId) {
  need(await supabase.from('community_blocks').upsert({ blocker_id: myId, blocked_id: theirId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }));
}
export async function unblockUser(myId, theirId) {
  need(await supabase.from('community_blocks').delete().eq('blocker_id', myId).eq('blocked_id', theirId));
}
export const getBlockedPeople = async () => need(await supabase.rpc('community_blocked_list')) || [];
export const REPORT_REASONS = [
  { id: 'inappropriate_photo', label: 'Inappropriate photo' },
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'eating_disorder_content', label: 'Harmful dieting or eating-disorder content' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else' },
];
export async function reportPost(myId, { postId = null, userId, reason, details = '' }) {
  need(await supabase.from('community_reports').insert({ reporter_id: myId, post_id: postId, reported_user_id: userId, reason, details: details.trim().slice(0, 500) }));
}
