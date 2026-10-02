import { describe, it, expect, vi, beforeEach } from 'vitest';

let paymentsFrozen = false;
let authUser = { id: 'u1', is_anonymous: false, email: 'alex@example.test' };
let authError = null;
let profileRow = {};
const sessionsCreate = vi.fn();
const getUserSpy = vi.fn(async () => ({ data: { user: authUser }, error: authError }));

vi.mock('stripe', () => ({
  default: class { constructor() { this.checkout = { sessions: { create: sessionsCreate } }; } },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table === 'app_settings') return { select: () => ({ maybeSingle: async () => ({ data: { payments_frozen: paymentsFrozen } }) }) };
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
    auth: { getUser: getUserSpy },
  }),
}));

const { default: handler } = await import('./create-checkout-session.js');

function post(body, { token = 'tok' } = {}) {
  const req = { method: 'POST', body, headers: { authorization: token ? `Bearer ${token}` : '', origin: 'https://app.example.test' } };
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler(req, res).then(() => res);
}

beforeEach(() => {
  paymentsFrozen = false;
  authUser = { id: 'u1', is_anonymous: false, email: 'alex@example.test' };
  authError = null;
  profileRow = {};
  sessionsCreate.mockReset();
  sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session_1' });
  getUserSpy.mockClear();
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
  process.env.STRIPE_COACH_PRICE_ID = 'price_coach';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('create-checkout-session — payments freeze switch', () => {
  it('blocks checkout with 503 while app_settings.payments_frozen is true, before ever checking auth', async () => {
    paymentsFrozen = true;
    const res = await post({ plan: 'pro' });
    expect(res.code).toBe(503);
    expect(res.body.error).toMatch(/paused/);
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('creates checkout normally when not frozen', async () => {
    const res = await post({ plan: 'pro' });
    expect(res.code).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.test/session_1');
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});
