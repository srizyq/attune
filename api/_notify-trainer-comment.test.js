import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) } }));
let sb;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));

const { default: handler } = await import('./notify-trainer-comment.js');

// What the fake database "contains" for one test.
let db;
const resolver = (s) => {
  const { table, filters, op } = s;
  if (op === 'delete') { db.deleted.push(filters); return { error: null }; }
  if (table === 'trainer_clients') return { data: db.link ? { id: 'link' } : null };
  if (table === 'trainer_comments') return { data: db.clientMessages };
  if (table === 'push_subscriptions') return { data: db.subs };
  if (table === 'profiles') return { data: db.profiles[filters.id] ?? null };
  return { data: null };
};
const call = (body, { user, token = 'tok' } = {}) => {
  sb = fakeSupabase(resolver, user ? { user } : undefined);
  const res = fakeRes();
  return handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res).then(() => res);
};

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue(undefined);
  db = {
    link: true, clientMessages: [{ created_at: '2026-09-20T10:00:00Z' }], deleted: [],
    subs: [{ id: 's1', endpoint: 'https://push/1', subscription: { endpoint: 'https://push/1' } }],
    profiles: {
      trainer: { name: 'Jordan Lee', notify_client_activity: true },
      client: { name: 'Sam Client', notify_trainer_comments: true },
    },
  };
  Object.assign(process.env, { VITE_SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', VITE_VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x' });
});

describe('common checks', () => {
  it('rejects non-POST, unauthenticated and unconfigured calls', async () => {
    const wrongMethod = fakeRes();
    await handler({ method: 'GET', headers: {} }, wrongMethod);
    expect(wrongMethod.code).toBe(405);
    const noAuth = await call({ clientId: 'client' }, { token: null });
    expect(noAuth.code).toBe(401);
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await call({ clientId: 'client' })).code).toBe(500);
  });
  it('requires an active relationship in both directions', async () => {
    db.link = false;
    expect((await call({ clientId: 'client' }, { user: { id: 'trainer' } })).code).toBe(403);
    expect((await call({ direction: 'to-trainer', trainerId: 'trainer' }, { user: { id: 'client' } })).code).toBe(403);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('trainer -> client (existing behaviour)', () => {
  it('notifies an opted-in client of a new note', async () => {
    db.profiles.trainer = { name: 'Jordan Lee' };
    const res = await call({ clientId: 'client' }, { user: { id: 'trainer' } });
    expect(res.body).toEqual({ sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ body: 'Jordan Lee left you a note', url: '/dashboard' });
  });
  it('respects the client opting out', async () => {
    db.profiles.client.notify_trainer_comments = false;
    const res = await call({ clientId: 'client' }, { user: { id: 'trainer' } });
    expect(res.body).toEqual({ sent: 0, reason: 'not opted in' });
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it('needs a clientId', async () => {
    expect((await call({}, { user: { id: 'trainer' } })).code).toBe(400);
  });
});

describe('client -> trainer', () => {
  const reply = () => call({ direction: 'to-trainer', trainerId: 'trainer' }, { user: { id: 'client' } });

  it('tells an opted-in coach a client replied, without revealing the message', async () => {
    const res = await reply();
    expect(res.body).toEqual({ sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({ title: 'Attune', body: 'Sam sent you a message', url: '/coach' });
  });
  it('is silent for a coach who has not opted in', async () => {
    db.profiles.trainer.notify_client_activity = false;
    expect((await reply()).body).toEqual({ sent: 0, reason: 'not opted in' });
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it('sends once per burst of replies', async () => {
    db.clientMessages = [{ created_at: '2026-09-20T10:00:30Z' }, { created_at: '2026-09-20T10:00:00Z' }];
    expect((await reply()).body).toEqual({ sent: 0, reason: 'throttled' });
    db.clientMessages = [{ created_at: '2026-09-20T10:10:00Z' }, { created_at: '2026-09-20T10:00:00Z' }];
    expect((await reply()).body).toEqual({ sent: 1 });
  });
  it('does nothing when the coach has no push subscription', async () => {
    db.subs = [];
    expect((await reply()).body).toEqual({ sent: 0, reason: 'no subscriptions' });
  });
  it('a client cannot notify a trainer they are not linked to, nor pass someone else as the client', async () => {
    db.link = false;
    expect((await reply()).code).toBe(403);
    // "clientId" is ignored in this direction: the caller IS the client.
    db.link = true;
    const res = await call({ direction: 'to-trainer', trainerId: 'trainer', clientId: 'victim' }, { user: { id: 'client' } });
    expect(sb.calls.find(c => c.table === 'trainer_clients').filters.client_id).toBe('client');
    expect(res.code).toBe(200);
  });
  it('needs a trainerId', async () => {
    expect((await call({ direction: 'to-trainer' }, { user: { id: 'client' } })).code).toBe(400);
  });
  it('drops a subscription the browser has revoked, and survives other send failures', async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await reply();
    expect(db.deleted).toEqual([{ id: 's1' }]);
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await reply()).body).toEqual({ sent: 0 });
  });
});
