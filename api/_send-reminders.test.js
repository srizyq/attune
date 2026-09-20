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
  if (table === 'trainer_clients') return { data: db.links };
  if (table === 'push_subscriptions') return { data: [sub] };
  if (table === 'food_logs') return { data: [] };
  return { data: null };
};
const run = async () => {
  sb = fakeSupabase(resolver);
  const res = fakeRes();
  await handler({ method: 'GET', headers: {} }, res);
  return res;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T10:00:00Z')); // 10:00 UTC
  sendNotification.mockReset().mockResolvedValue(undefined);
  db = {
    reminderProfiles: [], updates: [], digestError: false,
    trainers: [{ id: 'trainer', reminder_timezone: 'UTC', activity_alert_last_sent_date: null }],
    links: [
      { client_id: 'quiet', created_at: '2026-08-01T00:00:00Z' },
      { client_id: 'active', created_at: '2026-08-01T00:00:00Z' },
      { client_id: 'new', created_at: '2026-09-19T00:00:00Z' },
    ],
    lastLogs: [{ user_id: 'quiet', last_log_date: '2026-09-10' }, { user_id: 'active', last_log_date: '2026-09-20' }],
  };
  Object.assign(process.env, { VITE_SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', VITE_VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x' });
  delete process.env.CRON_SECRET;
});
afterEach(() => vi.useRealTimers());

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
