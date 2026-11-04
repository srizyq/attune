import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

const create = vi.hoisted(() => vi.fn());
let sb;
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));

import handler from './estimate-food.js';

const todayIso = new Date().toISOString().slice(0, 10);
function setup(profileOver = {}) {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.ANTHROPIC_API_KEY = 'a';
  create.mockReset();
  create.mockResolvedValue({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ items: [{ vitaminC: 30, magnesium: 55, junk: 9 }] }) }] });
  sb = fakeSupabase((state) => {
    if (state.table === 'profiles' && state.op === 'select') return { data: { is_premium: true, photo_scans_used: 0, photo_scans_period_start: todayIso, ...profileOver }, error: null };
    return { data: [], error: null };
  }, { user: { id: 'u1', email: 'someone@example.test' } });
}
const call = (body) => { const res = fakeRes(); return handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res).then(() => res); };

describe('estimate-food micros mode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns one cleaned set of nutrients per food for a Pro account, without touching the scan counter', async () => {
    setup();
    const res = await call({ mode: 'micros', items: [{ name: 'Laksa', grams: 400, cal: 520 }] });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ items: [{ vitaminC: 30, magnesium: 55 }] });
    expect(create.mock.calls[0][0].messages[0].content).toContain('Laksa');
    expect(sb.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('is Pro only: a free account is refused before any AI call', async () => {
    setup({ is_premium: false });
    const res = await call({ mode: 'micros', items: [{ name: 'Laksa' }] });
    expect(res.code).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a request with no usable foods', async () => {
    setup();
    expect((await call({ mode: 'micros', items: [{ name: '' }] })).code).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('reports an unreadable reply as a 502 instead of crashing', async () => {
    setup();
    create.mockResolvedValue({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'not json' }] });
    expect((await call({ mode: 'micros', items: [{ name: 'Laksa' }] })).code).toBe(502);
  });

  it('leaves the normal typed-dish estimate alone', async () => {
    setup();
    create.mockResolvedValue({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ name: 'Snack pack', cal: 900 }) }] });
    const res = await call({ description: 'halal snack pack' });
    expect(res.body).toMatchObject({ name: 'Snack pack' });
  });
});
