import { describe, it, expect, vi, beforeEach } from 'vitest';

let profileRow;
let storage;
const calls = [];
const subsList = vi.fn();
const subsCancel = vi.fn();
const deleteUser = vi.fn();
const portalCreate = vi.fn();

vi.mock('stripe', () => ({
  default: class { constructor() { this.subscriptions = { list: subsList, cancel: subsCancel }; this.billingPortal = { sessions: { create: portalCreate } }; } },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket) => ({
        list: async () => ({ data: storage[bucket].splice(0, 100).map((name) => ({ name })), error: null }),
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; },
      }),
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }), admin: { deleteUser } },
  }),
}));

const { default: handler } = await import('./create-portal-session.js');

function post(body) {
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok', origin: 'https://app.test' } };
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler(req, res).then(() => res);
}

beforeEach(() => {
  profileRow = { stripe_customer_id: 'cus_1' };
  storage = { 'progress-photos': ['a.jpg', 'b.jpg'], 'coach-logos': ['logo.png'], 'community-photos': ['p1.jpg', 'avatar-1.jpg'] };
  calls.length = 0;
  subsList.mockReset().mockResolvedValue({ data: [{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'canceled' }, { id: 'sub_3', status: 'trialing' }] });
  subsCancel.mockReset().mockResolvedValue({});
  deleteUser.mockReset().mockResolvedValue({ error: null });
  portalCreate.mockReset().mockResolvedValue({ url: 'https://billing.test/p' });
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('delete-account', () => {
  it('cancels live subscriptions, removes stored files, then deletes the auth user', async () => {
    const res = await post({ action: 'delete-account' });
    expect(res.code).toBe(200);
    expect(subsCancel.mock.calls.map((c) => c[0])).toEqual(['sub_1', 'sub_3']);
    expect(calls).toContainEqual(['remove', 'progress-photos', ['u1/a.jpg', 'u1/b.jpg']]);
    expect(calls).toContainEqual(['remove', 'coach-logos', ['u1/logo.png']]);
    expect(calls).toContainEqual(['remove', 'community-photos', ['u1/p1.jpg', 'u1/avatar-1.jpg']]);
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('works for an account that never subscribed', async () => {
    profileRow = {};
    const res = await post({ action: 'delete-account' });
    expect(res.code).toBe(200);
    expect(subsList).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('deletes nothing if a subscription cannot be cancelled', async () => {
    subsCancel.mockRejectedValue(new Error('stripe down'));
    const res = await post({ action: 'delete-account' });
    expect(res.code).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('reports failure if the auth user cannot be deleted', async () => {
    deleteUser.mockResolvedValue({ error: new Error('nope') });
    expect((await post({ action: 'delete-account' })).code).toBe(500);
  });

  it('still opens the billing portal for an ordinary request', async () => {
    const res = await post(undefined);
    expect(res.code).toBe(200);
    expect(res.body.url).toBe('https://billing.test/p');
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
