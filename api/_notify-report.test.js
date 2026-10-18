import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

// The problem-report branch of the notify endpoint against a fake database
// (the decisions themselves are in _reportNotify.test.js).
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
let sb;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));
const { default: handler } = await import('./notify-trainer-comment.js');

let db;
const resolver = (s) => {
  const { table, op } = s;
  if (table === 'rpc:rate_limit_hit') return { data: true };
  if (table === 'app_reports') {
    if (op === 'update') { db.updates.push(s.payload); return { error: null }; }
    if (s.head) return { count: db.runsToday };
    return { data: db.report };
  }
  if (table === 'app_admins') return { data: db.admin ? { user_id: 'boss' } : null };
  return { data: null };
};
const call = (body, user = { id: 'alex' }) => {
  sb = fakeSupabase(resolver, { user });
  const res = fakeRes();
  return handler({ method: 'POST', headers: { authorization: 'Bearer t', host: 'app.test' }, body }, res).then(() => res);
};

beforeEach(() => {
  Object.assign(process.env, { VITE_SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 's', VITE_VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'q' });
  delete process.env.GITHUB_TOKEN; delete process.env.RESEND_API_KEY;
  db = { report: { id: 'r1', user_id: 'alex', message: 'The scan button does nothing', screen: '/food', errors: [], notified_at: null, github_issue_url: null }, updates: [], runsToday: 0, admin: false };
});

describe('the report branch of the notify endpoint', () => {
  it('records that a new report was handled, even with no GitHub token or email key', async () => {
    const res = await call({ report: 'created', reportId: 'r1' });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, issue: false, claude: false });
    expect(db.updates[0]).toMatchObject({ status: 'new', github_issue_url: null });
  });
  it('turns away someone else\'s report', async () => {
    const res = await call({ report: 'created', reportId: 'r1' }, { id: 'mallory' });
    expect(res.code).toBe(403);
    expect(db.updates).toHaveLength(0);
  });
  it('only lets an admin ask Claude', async () => {
    expect((await call({ report: 'claude', reportId: 'r1' })).code).toBe(403);
    db.admin = true;
    expect((await call({ report: 'claude', reportId: 'r1' }, { id: 'boss' })).code).toBe(503); // GitHub isn't set up in this test
  });
  it('needs a signed-in caller', async () => {
    sb = fakeSupabase(resolver, { user: null });
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { report: 'created', reportId: 'r1' } }, res);
    expect(res.code).toBe(401);
  });
});
