// Community's push notifications and report emails, reached through
// notify-trainer-comment.js (the project is at Vercel's 12-function cap, so
// this rides on the existing push endpoint instead of adding one).
//
// Every event is "the caller just did X" and is checked against the database
// before anything is sent — the caller must really have followed / reacted /
// filed the report — so none of it can be used to push-spam an arbitrary
// person. All the decisions live here, against a small `store`, so they are
// unit-tested without a database; supabaseStore() is the real one.

export const MODERATOR_EMAIL = 'attun3app@gmail.com';
const MIN = 60 * 1000;
export const FRESH_MS = 5 * MIN;          // a follow/reaction only notifies right after it happens
export const FOLLOW_REPEAT_MS = 24 * 60 * MIN; // one push per follower per day
export const REACTION_REPEAT_MS = 60 * MIN;    // one push per post per hour

export const REPORT_REASONS = {
  inappropriate_photo: 'Inappropriate photo',
  harassment: 'Harassment or hate',
  eating_disorder_content: 'Harmful dieting or eating-disorder content',
  spam: 'Spam or advertising',
  impersonation: 'Pretending to be someone else',
  other: 'Something else',
};

export function followPayload(username, status) {
  return status === 'pending'
    ? { title: 'Attune', body: `@${username} wants to follow you`, url: '/community/find' }
    : { title: 'Attune', body: `@${username} started following you`, url: `/community/u/${username}` };
}

export function reactionPayload(username, others) {
  return {
    title: 'Attune',
    body: others > 0 ? `@${username} and ${others} other${others === 1 ? '' : 's'} reacted to your post` : `@${username} reacted to your post`,
    url: '/community',
  };
}

const money = (n) => Math.round(Number(n) || 0);

export function reportEmail({ report, reporter, reported, appUrl }) {
  const snap = report.post_snapshot;
  const lines = [
    `Reason: ${REPORT_REASONS[report.reason] || report.reason}`,
    `Reported: @${reported?.username || 'unknown'}`,
    `Reported by: @${reporter?.username || 'unknown'}`,
  ];
  if (report.details) lines.push(`What they said: ${report.details}`);
  if (snap) {
    const p = snap.payload || {};
    lines.push('', `The post (${snap.kind}): ${p.title || ''} — ${money(p.calories)} kcal, P ${money(p.protein_g)}g, C ${money(p.carbs_g)}g, F ${money(p.fat_g)}g`);
    if (snap.note) lines.push(`Note: ${snap.note}`);
    if (snap.photo_path) lines.push('It has a photo (open the moderation page to see it).');
  } else {
    lines.push('', 'This report is about the person, not a post.');
  }
  lines.push('', `Review it: ${appUrl}/community/moderate`);
  return { subject: `Community report: ${REPORT_REASONS[report.reason] || report.reason}`, text: lines.join('\n') };
}

const ago = (iso, now) => now - new Date(iso).getTime();
const ok = (json, status = 200) => ({ status, json });

/**
 * body: { community: 'follow', targetId } | { community: 'reaction', postId } | { community: 'report', reportId }.
 * Resolves to { status, json } for the endpoint to send.
 */
export async function handleCommunityEvent({ body, callerId, store, sendPush, sendEmail, moderatorEmail = MODERATOR_EMAIL, appUrl = '', now = Date.now() }) {
  const caller = await store.getCommunityProfile(callerId);
  if (!caller) return ok({ error: 'Join Community first.' }, 403);

  if (body.community === 'follow') {
    const targetId = body.targetId;
    if (!targetId || typeof targetId !== 'string') return ok({ error: 'Missing targetId' }, 400);
    const follow = await store.getFollow(callerId, targetId);
    if (!follow) return ok({ error: 'Not following' }, 403);
    if (ago(follow.created_at, now) > FRESH_MS) return ok({ sent: 0, reason: 'stale' });
    const target = await store.getCommunityProfile(targetId);
    if (!target) return ok({ sent: 0, reason: 'no such account' });
    if (!target.notify_follows) return ok({ sent: 0, reason: 'not opted in' });
    const key = `follow:${callerId}`;
    const last = await store.lastPush(targetId, key);
    if (last && ago(last, now) < FOLLOW_REPEAT_MS) return ok({ sent: 0, reason: 'throttled' });
    const subs = await store.subscriptions(targetId);
    if (!subs.length) return ok({ sent: 0, reason: 'no subscriptions' });
    const sent = await sendPush(subs, followPayload(caller.username, follow.status));
    if (sent > 0) await store.markPush(targetId, key, now);
    return ok({ sent });
  }

  if (body.community === 'reaction') {
    const postId = body.postId;
    if (!postId || typeof postId !== 'string') return ok({ error: 'Missing postId' }, 400);
    const post = await store.getPost(postId);
    if (!post) return ok({ error: 'Not found' }, 404);
    if (post.author_id === callerId) return ok({ sent: 0, reason: 'own post' });
    const reaction = await store.getReaction(postId, callerId);
    if (!reaction) return ok({ error: 'No reaction' }, 403);
    if (ago(reaction.created_at, now) > FRESH_MS) return ok({ sent: 0, reason: 'stale' });
    const author = await store.getCommunityProfile(post.author_id);
    if (!author) return ok({ sent: 0, reason: 'no such account' });
    if (!author.notify_reactions) return ok({ sent: 0, reason: 'not opted in' });
    const key = `react:${postId}`;
    const last = await store.lastPush(post.author_id, key);
    if (last && ago(last, now) < REACTION_REPEAT_MS) return ok({ sent: 0, reason: 'throttled' });
    const subs = await store.subscriptions(post.author_id);
    if (!subs.length) return ok({ sent: 0, reason: 'no subscriptions' });
    const others = Math.max(0, (await store.countReactors(postId, post.author_id)) - 1);
    const sent = await sendPush(subs, reactionPayload(caller.username, others));
    if (sent > 0) await store.markPush(post.author_id, key, now);
    return ok({ sent });
  }

  if (body.community === 'report') {
    const reportId = body.reportId;
    if (!reportId || typeof reportId !== 'string') return ok({ error: 'Missing reportId' }, 400);
    const report = await store.getReport(reportId);
    if (!report || report.reporter_id !== callerId) return ok({ error: 'Not found' }, 403);
    if (report.emailed_at) return ok({ sent: 0, reason: 'already emailed' });
    if (!sendEmail) return ok({ sent: 0, reason: 'email not configured' });
    const reported = await store.getCommunityProfile(report.reported_user_id);
    const { subject, text } = reportEmail({ report, reporter: caller, reported, appUrl });
    const delivered = await sendEmail({ to: moderatorEmail, subject, text });
    if (!delivered) return ok({ sent: 0, reason: 'email failed' }, 502);
    await store.markReportEmailed(reportId, now);
    return ok({ sent: 1 });
  }

  return ok({ error: 'Unknown community event' }, 400);
}

// ── The real store and email sender ─────────────────────────────────────────
export function supabaseStore(supabase) {
  const one = async (query) => (await query).data ?? null;
  return {
    getCommunityProfile: (id) => one(supabase.from('community_profiles').select('user_id, username, notify_follows, notify_reactions, banned_at').eq('user_id', id).maybeSingle())
      .then((p) => (p && !p.banned_at ? p : null)),
    getFollow: (follower, followee) => one(supabase.from('community_follows').select('status, created_at').eq('follower_id', follower).eq('followee_id', followee).maybeSingle()),
    getPost: (id) => one(supabase.from('community_posts').select('id, author_id').eq('id', id).maybeSingle()),
    getReaction: (postId, userId) => one(supabase.from('community_reactions').select('created_at').eq('post_id', postId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()),
    countReactors: async (postId, authorId) => {
      const rows = (await supabase.from('community_reactions').select('user_id').eq('post_id', postId)).data || [];
      return new Set(rows.map((r) => r.user_id).filter((u) => u !== authorId)).size;
    },
    lastPush: async (userId, key) => (await one(supabase.from('community_push_log').select('sent_at').eq('user_id', userId).eq('key', key).maybeSingle()))?.sent_at ?? null,
    markPush: async (userId, key, now) => { await supabase.from('community_push_log').upsert({ user_id: userId, key, sent_at: new Date(now).toISOString() }); },
    subscriptions: async (userId) => (await supabase.from('push_subscriptions').select('id, endpoint, subscription').eq('user_id', userId)).data || [],
    getReport: (id) => one(supabase.from('community_reports').select('id, reporter_id, reported_user_id, reason, details, post_snapshot, emailed_at').eq('id', id).maybeSingle()),
    markReportEmailed: async (id, now) => { await supabase.from('community_reports').update({ emailed_at: new Date(now).toISOString() }).eq('id', id); },
  };
}

/** A sender for Resend, or null when no key is set (reports are then only on the moderation page). */
export function resendSender(env, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY) return null;
  const from = env.COMMUNITY_EMAIL_FROM || 'Attune <onboarding@resend.dev>';
  return async ({ to, subject, text }) => {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        // `to` may be one address or several separated by commas.
        body: JSON.stringify({ from, to: String(to).split(',').map((a) => a.trim()).filter(Boolean), subject, text }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };
}
