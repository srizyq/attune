import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

// The Community branch of the push endpoint, wired to a fake database: the
// follow, reaction and report events end to end (decision logic is covered in
// _communityNotify.test.js).
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) } }));
let sb;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));
const { default: handler } = await import('./notify-trainer-comment.js');

let db;
const resolver = (s) => {
  const { table, filters, op } = s;
  if (table === 'rpc:rate_limit_hit') return { data: true };
  if (table === 'community_profiles') return { data: db.profiles[filters.user_id] ?? null };
  if (table === 'community_follows') return { data: db.follow };
  if (table === 'community_posts') return { data: db.post };
  if (table === 'community_reactions') return { data: s.single ? db.reaction : db.reactions };
  if (table === 'community_push_log') { if (op === 'upsert') { db.logged.push(s.payload); return { error: null }; } return { data: db.logRow }; }
  if (table === 'push_subscriptions') return { data: db.subs };
  if (table === 'community_reports') { if (op === 'update') { db.emailed.push(s.payload); return { error: null }; } return { data: db.report }; }
  return { data: null };
};
const call = (body, user = { id: 'alex' }) => {
  sb = fakeSupabase(resolver, { user });
  const res = fakeRes();
  return handler({ method: 'POST', headers: { authorization: 'Bearer t', host: 'app.test' }, body }, res).then(() => res);
};
const fresh = () => new Date(Date.now() - 5000).toISOString();

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue(undefined);
  db = {
    profiles: { alex: { user_id: 'alex', username: 'alex.m', notify_follows: true, notify_reactions: true }, maya: { user_id: 'maya', username: 'maya.k', notify_follows: true, notify_reactions: true } },
    follow: { status: 'pending', created_at: fresh() },
    post: { id: 'p1', author_id: 'maya' },
    reaction: { created_at: fresh() }, reactions: [{ user_id: 'alex' }, { user_id: 'sam' }],
    logRow: null, logged: [], emailed: [],
    subs: [{ id: 's1', endpoint: 'https://push/1', subscription: { endpoint: 'https://push/1' } }],
    report: { id: 'r1', reporter_id: 'alex', reported_user_id: 'maya', reason: 'spam', details: '', post_snapshot: null, emailed_at: null },
  };
  Object.assign(process.env, { VITE_SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', VITE_VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x' });
  delete process.env.RESEND_API_KEY;
});
afterEach(() => vi.restoreAllMocks());

describe('Community events on the push endpoint', () => {
  it('a follow request buzzes the person asked and is logged', async () => {
    const res = await call({ community: 'follow', targetId: 'maya' });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toBe('@alex.m wants to follow you');
    expect(db.logged[0]).toMatchObject({ user_id: 'maya', key: 'follow:alex' });
  });

  it('a reaction buzzes the author and counts the other people', async () => {
    const res = await call({ community: 'reaction', postId: 'p1' });
    expect(res.body).toEqual({ sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toBe('@alex.m and 1 other reacted to your post');
  });

  it('someone who has not joined Community gets nothing and cannot ask twice', async () => {
    delete db.profiles.alex;
    const res = await call({ community: 'follow', targetId: 'maya' });
    expect(res.code).toBe(403);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('a report is emailed to the moderator through Resend and marked done', async () => {
    process.env.RESEND_API_KEY = 'rk';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    const res = await call({ community: 'report', reportId: 'r1' });
    expect(res.body).toEqual({ sent: 1 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body)).toMatchObject({ to: ['attun3app@gmail.com'] });
    expect(JSON.parse(init.body).text).toContain('https://app.test/community/moderate');
    expect(db.emailed).toHaveLength(1);
  });

  it('without a Resend key a report is simply left for the moderation page', async () => {
    const res = await call({ community: 'report', reportId: 'r1' });
    expect(res.body).toEqual({ sent: 0, reason: 'email not configured' });
    expect(db.emailed).toHaveLength(0);
  });

  it('the existing coach messages still work (a body with no community key)', async () => {
    const res = await call({ clientId: 'client' }, { id: 'trainer' });
    expect(res.code).toBe(403); // no trainer relationship in this fake — the old path ran
  });
});
