import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

const create = vi.hoisted(() => vi.fn());
let sb;
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));

import handler from './recognize-menu.js';

const FREE_USER_AT_CAP = { is_premium: false, goal: 'maintain', calorie_target: 2000, menu_scans_used: 3, menu_scans_period_start: new Date().toISOString().slice(0, 10) };
const REPLY = { portions: [{ label: 'Regular', scale: 1 }, { label: 'Large', scale: 1.4 }], tweaks: [{ label: 'No cheese', cal: -90 }], allergens: ['Dairy', 'Lava'], source: { quote: 'Wrap', box: null } };

function req(body) {
  return { method: 'POST', headers: { authorization: 'Bearer t' }, body: { image: 'AAAA', mediaType: 'image/jpeg', ...body } };
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.ANTHROPIC_API_KEY = 'a';
  create.mockReset();
  create.mockResolvedValue({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(REPLY) }] });
  sb = fakeSupabase((state) => {
    if (state.table === 'profiles' && state.op === 'select') return { data: FREE_USER_AT_CAP, error: null };
    return { data: [], error: null };
  }, { user: { id: 'u1', email: 'someone@example.test' } });
});

describe('recognize-menu detail mode', () => {
  it('answers a free user who is already at the scan cap, from a small grace allowance', async () => {
    const res = fakeRes();
    await handler(req({ detail: true, pick: { name: 'Wrap', cal: 700 } }), res);
    expect(res.code).toBe(200);
    expect(res.body.portions).toHaveLength(2);
  });

  it('sanitises the model reply before returning it', async () => {
    const res = fakeRes();
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), res);
    expect(res.body.allergens).toEqual(['Dairy']);
    expect(res.body.source.box).toBeNull();
  });

  it('is free while the user is still under the cap', async () => {
    sb = fakeSupabase((state) => (state.table === 'profiles' && state.op === 'select'
      ? { data: { ...FREE_USER_AT_CAP, menu_scans_used: 1 }, error: null } : { data: [], error: null }), { user: { id: 'u1', email: 'someone@example.test' } });
    const res = fakeRes();
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), res);
    expect(res.code).toBe(200);
    expect(sb.calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(false);
  });

  it('counts past the cap, and stops once the grace allowance is spent', async () => {
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), fakeRes());
    expect(sb.calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(true);
    sb = fakeSupabase((state) => (state.table === 'profiles' && state.op === 'select'
      ? { data: { ...FREE_USER_AT_CAP, menu_scans_used: 13 }, error: null } : { data: [], error: null }), { user: { id: 'u1', email: 'someone@example.test' } });
    const res = fakeRes();
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), res);
    expect(res.code).toBe(403);
  });

  it('treats a correction without the previous item as a normal, capped scan', async () => {
    const res = fakeRes();
    await handler(req({ correction: 'x' }), res);
    expect(res.code).toBe(403);
  });

  it('sends the detail prompt, not the full-menu prompt', async () => {
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), fakeRes());
    const text = create.mock.calls[0][0].messages[0].content.find((b) => b.type === 'text').text;
    expect(text).toContain('picked this dish');
    expect(create.mock.calls[0][0].max_tokens).toBe(1024);
  });

  it('still enforces the cap on a normal scan', async () => {
    const res = fakeRes();
    await handler(req({}), res);
    expect(res.code).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('ignores detail:true without a pick (falls through to the capped scan path)', async () => {
    const res = fakeRes();
    await handler(req({ detail: true }), res);
    expect(res.code).toBe(403);
  });
});

describe('recognize-menu rate limit', () => {
  it('answers 429 and never calls the model when the caller is over the per-minute limit', async () => {
    sb = fakeSupabase((state) => {
      if (state.table === 'rpc:rate_limit_hit') return { data: false, error: null };
      return { data: [], error: null };
    }, { user: { id: 'u1', email: 'someone@example.test' } });
    const res = fakeRes();
    await handler(req({ detail: true, pick: { name: 'Wrap' } }), res);
    expect(res.code).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
});
