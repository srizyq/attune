import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) } }));
let sb;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));
const { default: handler } = await import('./send-reminders.js');

let db;
const sub = { id: 's1', endpoint: 'e1', subscription: { endpoint: 'e1' } };
const resolver = (s) => {
  const { table, op, filters, payload } = s;
  if (table === 'rpc:client_last_log_dates') { if (db.rpcThrows) throw new Error('rpc exploded'); return { data: db.lastLogs }; }
  if (op === 'update') { db.updates.push({ table, payload, filters }); return { error: null }; }
  if (op === 'delete') return { error: null };
  if (table === 'profiles' && 'reminder_enabled' in filters) return { data: db.reminderProfiles, error: null };
  if (table === 'profiles' && 'notify_client_activity' in filters) return db.digestError ? { data: null, error: { message: 'column does not exist' } } : { data: db.trainers, error: null };
  if (table === 'checkin_forms' && op === 'select') return db.checkinError ? { data: null, error: { message: 'relation does not exist' } } : { data: db.forms, error: null };
  if (table === 'checkin_responses') return { data: db.checkinResponses };
  if (table === 'trainer_clients' && filters.trainer_id === 'coach' && filters.client_id) return { data: db.checkinLink ? { id: 'l' } : null };
  if (table === 'fasts' && op === 'select') return db.fastsError ? { data: null, error: { message: 'relation does not exist' } } : { data: db.fasts, error: null };
  if (table === 'profiles' && filters.id === 'faster') return { data: db.faster };
  if (table === 'profiles' && filters.id === 'client1') return { data: db.checkinClient };
  if (table === 'profiles' && filters.id === 'coach') return { data: { name: 'Jordan Lee' } };
  if (table === 'profiles' && 'free_month_reminder_sent_at' in filters) {
    if (db.freeMonthThrows) throw new Error('query exploded');
    return db.freeMonthError ? { data: null, error: { message: 'column does not exist' } } : { data: db.freeMonthCandidates, error: null };
  }
  if (table === 'trainer_clients') return { data: db.links };
  if (table === 'push_subscriptions') return { data: db.freeMonthSubs ?? [sub] };
  if (table === 'food_logs') return { data: [] };
  return { data: null };
};
const run = async () => {
  sb = fakeSupabase(resolver);
  const res = fakeRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } }, res);
  return res;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T10:00:00Z')); // 10:00 UTC
  sendNotification.mockReset().mockResolvedValue(undefined);
  db = {
    reminderProfiles: [], updates: [], digestError: false,
    fasts: [], fastsError: false, faster: { notify_fast_end: true, reminder_timezone: 'UTC' },
    freeMonthCandidates: [], freeMonthError: false,
    forms: [], checkinResponses: [], checkinLink: true, checkinError: false, checkinClient: { notify_trainer_comments: true, reminder_timezone: null },
    trainers: [{ id: 'trainer', reminder_timezone: 'UTC', activity_alert_last_sent_date: null }],
    links: [
      { client_id: 'quiet', created_at: '2026-08-01T00:00:00Z' },
      { client_id: 'active', created_at: '2026-08-01T00:00:00Z' },
      { client_id: 'new', created_at: '2026-09-19T00:00:00Z' },
    ],
    lastLogs: [{ user_id: 'quiet', last_log_date: '2026-09-10' }, { user_id: 'active', last_log_date: '2026-09-20' }],
  };
  Object.assign(process.env, { VITE_SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', VITE_VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x' });
  process.env.CRON_SECRET = 'test-secret';
});
afterEach(() => vi.useRealTimers());

describe('cron auth', () => {
  it('rejects a missing or wrong secret', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.code).toBe(401);
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.code).toBe(500);
  });
});

describe('inactive-client digest', () => {
  it('sends a coach one push with the count of quiet clients, and records that it did', async () => {
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.digest).toEqual({ checked: 1, sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({ title: 'Attune', body: "1 client hasn't logged in 3+ days", url: '/coach' });
    expect(db.updates).toContainEqual({ table: 'profiles', payload: { activity_alert_last_sent_date: '2026-09-20' }, filters: { id: 'trainer' } });
  });

  it('marks the day as handled before sending, so a crash cannot cause repeats', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await run();
    expect(db.updates.some(u => u.payload.activity_alert_last_sent_date === '2026-09-20')).toBe(true);
  });

  it('waits until 09:00 in the coach\'s own timezone', async () => {
    db.trainers[0].reminder_timezone = 'Australia/Sydney'; // 20:00 there — due
    expect((await run()).body.digest.sent).toBe(1);
    sendNotification.mockClear();
    vi.setSystemTime(new Date('2026-09-19T20:00:00Z')); // 06:00 next day in Sydney — not yet
    db.trainers[0].activity_alert_last_sent_date = null;
    expect((await run()).body.digest.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends at most once per local day', async () => {
    db.trainers[0].activity_alert_last_sent_date = '2026-09-20';
    expect((await run()).body.digest.sent).toBe(0);
  });

  it('stays quiet when everyone is logging, and when a coach has no clients', async () => {
    db.lastLogs = [{ user_id: 'quiet', last_log_date: '2026-09-20' }, { user_id: 'active', last_log_date: '2026-09-20' }];
    expect((await run()).body.digest.sent).toBe(0);
    db.links = [];
    expect((await run()).body.digest.sent).toBe(0);
  });

  it('is harmless before the coach-tools migration has been run', async () => {
    db.digestError = true;
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.digest).toEqual({ checked: 0, sent: 0 });
  });

  it('never lets a digest failure break the reminders response', async () => {
    db.rpcThrows = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.digest).toEqual({ checked: 0, sent: 0 });
  });
});

describe('check-in due nudges', () => {
  const dayMs = 86400000;
  const dueForm = () => ({ id: 'f1', client_id: 'client1', trainer_id: 'coach', cadence_days: 7, created_at: new Date(Date.now() - 20 * dayMs).toISOString(), last_notified_at: null });
  beforeEach(() => { db.trainers = []; db.forms = [dueForm()]; });

  it('nudges a client whose check-in is due, and stamps it so it is not repeated', async () => {
    const res = await run();
    expect(res.body.checkins).toEqual({ checked: 1, sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls.at(-1)[1])).toEqual({ title: 'Attune', body: 'Jordan sent you a check-in', url: '/coach' });
    expect(db.updates).toContainEqual(expect.objectContaining({ table: 'checkin_forms', payload: expect.objectContaining({ last_notified_at: expect.any(String) }), filters: { id: 'f1' } }));
  });

  it('does not nudge a form already notified for this due date', async () => {
    db.forms = [{ ...dueForm(), last_notified_at: new Date().toISOString() }];
    expect((await run()).body.checkins.sent).toBe(0);
  });

  it('does not nudge when the client answered recently', async () => {
    db.checkinResponses = [{ form_id: 'f1', created_at: new Date(Date.now() - 2 * dayMs).toISOString() }];
    expect((await run()).body.checkins.sent).toBe(0);
  });

  it('respects the client\'s opt-out, and a disconnected coach', async () => {
    db.checkinClient = { notify_trainer_comments: false, reminder_timezone: null };
    expect((await run()).body.checkins.sent).toBe(0);
    db.checkinClient = { notify_trainer_comments: true, reminder_timezone: null };
    db.checkinLink = false;
    expect((await run()).body.checkins.sent).toBe(0);
  });

  it('stays quiet in the client\'s small hours, when their timezone is known', async () => {
    db.checkinClient = { notify_trainer_comments: true, reminder_timezone: 'Australia/Sydney' }; // 20:00 UTC-day10:00 -> 20:00 in Sydney: awake
    expect((await run()).body.checkins.sent).toBe(1);
    sendNotification.mockClear();
    vi.setSystemTime(new Date('2026-09-20T17:00:00Z')); // 03:00 next day in Sydney
    db.forms = [dueForm()];
    expect((await run()).body.checkins.sent).toBe(0);
  });

  it('is harmless before the check-in tables exist, and never breaks the response', async () => {
    db.checkinError = true;
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.checkins).toEqual({ checked: 0, sent: 0 });
  });
});

describe('free-month reminder', () => {
  beforeEach(() => { db.trainers = []; db.forms = []; });

  it('nudges someone still eligible for their free month, and stamps it so it is not repeated', async () => {
    db.freeMonthCandidates = [{ id: 'u1' }];
    const res = await run();
    expect(res.body.freeMonth).toEqual({ checked: 1, sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls.at(-1)[1])).toEqual({
      title: 'Attune',
      body: "You've got a free month of Pro waiting — unlimited AI scans, full micronutrient tracking, and more, on us for 30 days.",
      url: '/pricing',
    });
    expect(db.updates).toContainEqual(expect.objectContaining({ table: 'profiles', payload: expect.objectContaining({ free_month_reminder_sent_at: expect.any(String) }), filters: { id: 'u1' } }));
  });

  it('marks as reminded before sending, so a crash cannot cause repeats', async () => {
    db.freeMonthCandidates = [{ id: 'u1' }];
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await run();
    expect(db.updates.some(u => u.table === 'profiles' && u.filters.id === 'u1' && u.payload.free_month_reminder_sent_at)).toBe(true);
  });

  it('skips someone with no push subscription', async () => {
    db.freeMonthCandidates = [{ id: 'u1' }];
    db.freeMonthSubs = [];
    expect((await run()).body.freeMonth).toEqual({ checked: 1, sent: 0 });
  });

  it('is harmless before the free-month-reminder migration has been run', async () => {
    db.freeMonthError = true;
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.freeMonth).toEqual({ checked: 0, sent: 0 });
  });

  it('never lets a query failure break the reminders response', async () => {
    db.freeMonthThrows = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.freeMonth).toEqual({ checked: 0, sent: 0 });
  });
});

describe('fast-end push', () => {
  // 10:00 UTC on the 20th (see beforeEach). Started 18:00 the day before, 16h goal → ended at 10:00.
  const finished = { id: 'f1', user_id: 'faster', target_hours: 16, started_at: '2026-09-19T18:00:00Z', ended_at: null, end_notified_at: null };

  it('notifies someone whose fast has reached its goal, and stamps it first', async () => {
    db.fasts = [finished];
    const res = await run();
    expect(res.body.fastEnds).toEqual({ checked: 1, sent: 1 });
    expect(JSON.parse(sendNotification.mock.calls.at(-1)[1])).toMatchObject({ url: '/fasting' });
    expect(db.updates.find((u) => u.table === 'fasts')).toMatchObject({ filters: { id: 'f1' } });
    expect(db.updates.find((u) => u.table === 'fasts').payload.end_notified_at).toBeTruthy();
  });

  it('leaves a fast that is still running alone', async () => {
    db.fasts = [{ ...finished, started_at: '2026-09-20T02:00:00Z' }];
    const res = await run();
    expect(res.body.fastEnds.sent).toBe(0);
    expect(db.updates.some((u) => u.table === 'fasts')).toBe(false);
  });

  it('sends nothing when the person has not opted in', async () => {
    db.fasts = [finished];
    db.faster = { notify_fast_end: false, reminder_timezone: 'UTC' };
    const res = await run();
    expect(res.body.fastEnds.sent).toBe(0);
    expect(db.updates.some((u) => u.table === 'fasts')).toBe(false);
  });

  it('holds the push until they are plausibly awake, without losing it', async () => {
    vi.setSystemTime(new Date('2026-09-20T03:00:00Z')); // 03:00 in UTC
    db.fasts = [{ ...finished, started_at: '2026-09-19T10:00:00Z' }];
    const res = await run();
    expect(res.body.fastEnds.sent).toBe(0);
    expect(db.updates.some((u) => u.table === 'fasts')).toBe(false); // not stamped, so a later run still sends it
  });

  it('does nothing — and breaks nothing else — before the fasts table exists', async () => {
    db.fastsError = true;
    const res = await run();
    expect(res.code).toBe(200);
    expect(res.body.fastEnds).toEqual({ checked: 0, sent: 0 });
    expect(res.body.digest).toBeDefined();
  });
});
