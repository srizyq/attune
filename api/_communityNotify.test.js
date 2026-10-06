import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommunityEvent, followPayload, reactionPayload, reportEmail, resendSender, FRESH_MS, FOLLOW_REPEAT_MS, REACTION_REPEAT_MS } from './_communityNotify.js';

const NOW = new Date('2026-10-07T12:00:00Z').getTime();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const SUB = { id: 's1', endpoint: 'e', subscription: { endpoint: 'e' } };

let db;
let pushes;
let emails;
let store;
const sendPush = async (subs, payload) => { pushes.push({ subs, payload }); return subs.length; };
const sendEmail = async (mail) => { emails.push(mail); return true; };
const run = (body, over = {}) => handleCommunityEvent({ body, callerId: 'alex', store, sendPush, sendEmail, appUrl: 'https://app.test', now: NOW, ...over });

beforeEach(() => {
  pushes = []; emails = [];
  db = {
    profiles: {
      alex: { user_id: 'alex', username: 'alex.m', notify_follows: true, notify_reactions: true },
      maya: { user_id: 'maya', username: 'maya.k', notify_follows: true, notify_reactions: true },
    },
    follows: { 'alex>maya': { status: 'pending', created_at: iso(10_000) } },
    posts: { p1: { id: 'p1', author_id: 'maya' } },
    reactions: { 'p1:alex': { created_at: iso(10_000) } },
    reactors: 1,
    log: {},
    subs: { maya: [SUB] },
    reports: { r1: { id: 'r1', reporter_id: 'alex', reported_user_id: 'maya', reason: 'spam', details: 'selling things', post_snapshot: { kind: 'meal', payload: { title: 'Bowl', calories: 640, protein_g: 46, carbs_g: 52, fat_g: 26 }, note: 'buy now', photo_path: 'x' }, emailed_at: null } },
    marked: [],
  };
  store = {
    getCommunityProfile: async (id) => db.profiles[id] ?? null,
    getFollow: async (a, b) => db.follows[`${a}>${b}`] ?? null,
    getPost: async (id) => db.posts[id] ?? null,
    getReaction: async (p, u) => db.reactions[`${p}:${u}`] ?? null,
    countReactors: async () => db.reactors,
    lastPush: async (u, k) => db.log[`${u}:${k}`] ?? null,
    markPush: async (u, k, now) => { db.log[`${u}:${k}`] = new Date(now).toISOString(); },
    subscriptions: async (u) => db.subs[u] ?? [],
    getReport: async (id) => db.reports[id] ?? null,
    markReportEmailed: async (id) => { db.marked.push(id); db.reports[id].emailed_at = 'x'; },
  };
});

describe('messages', () => {
  it('read well and never include anything private', () => {
    expect(followPayload('alex.m', 'pending').body).toBe('@alex.m wants to follow you');
    expect(followPayload('alex.m', 'accepted')).toMatchObject({ body: '@alex.m started following you', url: '/community/u/alex.m' });
    expect(reactionPayload('alex.m', 0).body).toBe('@alex.m reacted to your post');
    expect(reactionPayload('alex.m', 1).body).toBe('@alex.m and 1 other reacted to your post');
    expect(reactionPayload('alex.m', 4).body).toBe('@alex.m and 4 others reacted to your post');
  });
  it('the report email says who, why and what, and where to review it', () => {
    const { subject, text } = reportEmail({ report: db.reports.r1, reporter: db.profiles.alex, reported: db.profiles.maya, appUrl: 'https://app.test' });
    expect(subject).toBe('Community report: Spam or advertising');
    expect(text).toContain('Reported: @maya.k');
    expect(text).toContain('Reported by: @alex.m');
    expect(text).toContain('What they said: selling things');
    expect(text).toContain('Bowl — 640 kcal, P 46g, C 52g, F 26g');
    expect(text).toContain('Note: buy now');
    expect(text).toContain('has a photo');
    expect(text).toContain('https://app.test/community/moderate');
    const person = reportEmail({ report: { ...db.reports.r1, post_snapshot: null }, reporter: null, reported: null, appUrl: 'x' });
    expect(person.text).toContain('about the person');
  });
});

describe('follow', () => {
  it('a request pushes the person asked, once', async () => {
    const r = await run({ community: 'follow', targetId: 'maya' });
    expect(r).toEqual({ status: 200, json: { sent: 1 } });
    expect(pushes[0].payload.body).toBe('@alex.m wants to follow you');
    expect(pushes[0].subs).toEqual([SUB]);
    const again = await run({ community: 'follow', targetId: 'maya' });
    expect(again.json).toEqual({ sent: 0, reason: 'throttled' });
    expect(pushes).toHaveLength(1);
  });
  it('can follow-notify again after a day', async () => {
    await run({ community: 'follow', targetId: 'maya' });
    const later = await run({ community: 'follow', targetId: 'maya' }, { now: NOW + FOLLOW_REPEAT_MS + 1 });
    expect(later.json.sent).toBe(0); // the follow itself is stale by then
    db.follows['alex>maya'].created_at = new Date(NOW + FOLLOW_REPEAT_MS).toISOString();
    expect((await run({ community: 'follow', targetId: 'maya' }, { now: NOW + FOLLOW_REPEAT_MS + 1 })).json.sent).toBe(1);
  });
  it('an instant follow of a public account says started following', async () => {
    db.follows['alex>maya'].status = 'accepted';
    await run({ community: 'follow', targetId: 'maya' });
    expect(pushes[0].payload.body).toBe('@alex.m started following you');
  });
  it('refuses a follow that is not real, or old, or when they opted out or have no devices', async () => {
    delete db.follows['alex>maya'];
    expect((await run({ community: 'follow', targetId: 'maya' })).status).toBe(403);
    db.follows['alex>maya'] = { status: 'pending', created_at: iso(FRESH_MS + 1000) };
    expect((await run({ community: 'follow', targetId: 'maya' })).json.reason).toBe('stale');
    db.follows['alex>maya'].created_at = iso(1000);
    db.profiles.maya.notify_follows = false;
    expect((await run({ community: 'follow', targetId: 'maya' })).json.reason).toBe('not opted in');
    db.profiles.maya.notify_follows = true;
    db.subs.maya = [];
    expect((await run({ community: 'follow', targetId: 'maya' })).json.reason).toBe('no subscriptions');
    expect(pushes).toHaveLength(0);
    expect((await run({ community: 'follow' })).status).toBe(400);
  });
  it('someone who has not joined Community cannot trigger anything', async () => {
    delete db.profiles.alex;
    expect((await run({ community: 'follow', targetId: 'maya' })).status).toBe(403);
  });
});

describe('reactions', () => {
  it('push the author once an hour per post, counting the others', async () => {
    db.reactors = 3;
    const r = await run({ community: 'reaction', postId: 'p1' });
    expect(r.json).toEqual({ sent: 1 });
    expect(pushes[0].payload.body).toBe('@alex.m and 2 others reacted to your post');
    expect((await run({ community: 'reaction', postId: 'p1' })).json.reason).toBe('throttled');
    db.reactions['p1:alex'].created_at = new Date(NOW + REACTION_REPEAT_MS).toISOString();
    expect((await run({ community: 'reaction', postId: 'p1' }, { now: NOW + REACTION_REPEAT_MS + 1 })).json.sent).toBe(1);
  });
  it('not for your own post, a reaction that is not there, an unknown post, or an opt-out', async () => {
    db.posts.p1.author_id = 'alex';
    expect((await run({ community: 'reaction', postId: 'p1' })).json.reason).toBe('own post');
    db.posts.p1.author_id = 'maya';
    delete db.reactions['p1:alex'];
    expect((await run({ community: 'reaction', postId: 'p1' })).status).toBe(403);
    db.reactions['p1:alex'] = { created_at: iso(1000) };
    expect((await run({ community: 'reaction', postId: 'nope' })).status).toBe(404);
    db.profiles.maya.notify_reactions = false;
    expect((await run({ community: 'reaction', postId: 'p1' })).json.reason).toBe('not opted in');
    expect(pushes).toHaveLength(0);
  });
});

describe('reports', () => {
  it('emails the moderator once and marks it', async () => {
    const r = await run({ community: 'report', reportId: 'r1' });
    expect(r.json).toEqual({ sent: 1 });
    expect(emails[0].to).toBe('attun3app@gmail.com');
    expect(emails[0].text).toContain('Reported: @maya.k');
    expect(db.marked).toEqual(['r1']);
    expect((await run({ community: 'report', reportId: 'r1' })).json.reason).toBe('already emailed');
    expect(emails).toHaveLength(1);
  });
  it('can go to a different moderator address', async () => {
    await run({ community: 'report', reportId: 'r1' }, { moderatorEmail: 'someone@example.test' });
    expect(emails[0].to).toBe('someone@example.test');
  });
  it('only the person who filed it can trigger it; an email failure is retried later', async () => {
    db.reports.r1.reporter_id = 'maya';
    expect((await run({ community: 'report', reportId: 'r1' })).status).toBe(403);
    expect((await run({ community: 'report', reportId: 'nope' })).status).toBe(403);
    db.reports.r1.reporter_id = 'alex';
    const failing = await run({ community: 'report', reportId: 'r1' }, { sendEmail: async () => false });
    expect(failing.status).toBe(502);
    expect(db.marked).toEqual([]);
    expect((await run({ community: 'report', reportId: 'r1' }, { sendEmail: null })).json.reason).toBe('email not configured');
  });
  it('an unknown event is a bad request', async () => {
    expect((await run({ community: 'dance' })).status).toBe(400);
  });
});

describe('resendSender', () => {
  it('is off without a key; sends through Resend with the right shape when on', async () => {
    expect(resendSender({})).toBeNull();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const send = resendSender({ RESEND_API_KEY: 'rk', COMMUNITY_EMAIL_FROM: 'Attune <hi@a.test>' }, fetchImpl);
    expect(await send({ to: 'm@x.test', subject: 'S', text: 'T' })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer rk');
    expect(JSON.parse(init.body)).toEqual({ from: 'Attune <hi@a.test>', to: ['m@x.test'], subject: 'S', text: 'T' });
    expect(await resendSender({ RESEND_API_KEY: 'rk' }, vi.fn().mockResolvedValue({ ok: false }))({ to: 'a', subject: 'b', text: 'c' })).toBe(false);
    expect(await resendSender({ RESEND_API_KEY: 'rk' }, vi.fn().mockRejectedValue(new Error('net')))({ to: 'a', subject: 'b', text: 'c' })).toBe(false);
  });
});
