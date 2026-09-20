import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import RealStripe from 'stripe';

const SECRET = 'whsec_test_only';
const retrieve = vi.fn();
const writes = [];
let dbError = null;

// Real Stripe (so signature verification is genuinely exercised) with only
// the one network call — subscriptions.retrieve — swapped for a fake.
vi.mock('stripe', async () => {
  const actual = await vi.importActual('stripe');
  const Real = actual.default;
  return { default: class extends Real { constructor(key) { super(key); Object.defineProperty(this, 'subscriptions', { value: { retrieve }, configurable: true }); } } };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      update: (fields) => ({
        eq: async (column, value) => { writes.push({ table, fields, column, value }); return { error: dbError }; },
      }),
    }),
  }),
}));

const { default: handler } = await import('./stripe-webhook.js');
const signer = new RealStripe('sk_test_dummy');

function post(event, { signature, method = 'POST' } = {}) {
  const payload = JSON.stringify(event);
  const req = Readable.from([Buffer.from(payload)]);
  req.method = method;
  req.headers = { 'stripe-signature': signature ?? signer.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b; return this; } };
  return handler(req, res).then(() => res);
}
const evt = (type, object) => ({ id: 'evt_1', object: 'event', type, data: { object } });

beforeEach(() => {
  writes.length = 0;
  dbError = null;
  retrieve.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('stripe-webhook request handling', () => {
  it('rejects anything but POST', async () => {
    expect((await post(evt('x', {}), { method: 'GET' })).code).toBe(405);
  });
  it('rejects a forged/unsigned event and writes nothing', async () => {
    const res = await post(evt('checkout.session.completed', { client_reference_id: 'u1' }), { signature: 't=1,v1=deadbeef' });
    expect(res.code).toBe(400);
    expect(writes).toHaveLength(0);
  });
  it('refuses to run unconfigured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post(evt('x', {}))).code).toBe(400);
  });
  it('acknowledges events it does not care about without writing', async () => {
    const res = await post(evt('invoice.paid', { id: 'in_1' }));
    expect(res.code).toBe(200);
    expect(writes).toHaveLength(0);
  });
});

describe('Coach Pass free trial', () => {
  const session = { id: 'cs_1', client_reference_id: 'user-1', customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'coach' } };

  it('grants the pass at checkout and records that it is a trial', async () => {
    retrieve.mockResolvedValue({ status: 'trialing' });
    const res = await post(evt('checkout.session.completed', session));
    expect(res.code).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(writes).toEqual([{
      table: 'profiles', column: 'id', value: 'user-1',
      fields: { coach_pass: true, coach_pass_status: 'trialing', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' },
    }]);
  });

  it('still grants the pass if Stripe cannot be asked for the status', async () => {
    retrieve.mockRejectedValue(new Error('stripe down'));
    const res = await post(evt('checkout.session.completed', session));
    expect(res.code).toBe(200);
    expect(writes[0].fields).toMatchObject({ coach_pass: true, coach_pass_status: 'active' });
  });

  it('does not revoke the pass when Stripe then reports the subscription as trialing', async () => {
    const res = await post(evt('customer.subscription.updated', { id: 'sub_1', status: 'trialing', metadata: { plan: 'coach' } }));
    expect(res.code).toBe(200);
    expect(writes).toEqual([{ table: 'profiles', column: 'stripe_subscription_id', value: 'sub_1', fields: { coach_pass: true, coach_pass_status: 'trialing' } }]);
  });

  it('keeps the pass through trial -> paid, withdraws it on a failed first charge', async () => {
    await post(evt('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: {} }));
    await post(evt('customer.subscription.updated', { id: 'sub_1', status: 'past_due', metadata: {} }));
    expect(writes.map(w => w.fields.coach_pass)).toEqual([true, false]);
  });

  it('removes the pass and coach mode on cancellation', async () => {
    await post(evt('customer.subscription.deleted', { id: 'sub_1', metadata: {} }));
    expect(writes[0].fields).toEqual({ coach_pass: false, coach_mode: false, coach_pass_status: 'canceled' });
  });
});

describe('Pro subscriptions are untouched by the coach logic', () => {
  it('writes the Pro columns only', async () => {
    retrieve.mockResolvedValue({ status: 'active' });
    await post(evt('checkout.session.completed', { client_reference_id: 'user-1', customer: 'cus_1', subscription: 'sub_p', metadata: { plan: 'pro' } }));
    expect(writes[0].fields).toEqual({ is_premium: true, pro_status: 'active', stripe_customer_id: 'cus_1', stripe_pro_subscription_id: 'sub_p' });
  });
});

describe('a failed database write', () => {
  it('returns 500 so Stripe retries instead of silently dropping the change', async () => {
    dbError = new Error('db unavailable');
    const res = await post(evt('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: {} }));
    expect(res.code).toBe(500);
  });
});
