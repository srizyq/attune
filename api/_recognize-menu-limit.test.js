import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeRes } from './_fakes.js';

const create = vi.hoisted(() => vi.fn());
let sb;
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));

import handler from './recognize-menu.js';

const todayIso = new Date().toISOString().slice(0, 10);
const limit = (over = {}) => ({ id: 'a', start: '2000-01-01', end: '2999-12-31', calories: 1500, created_at: '2026-10-01T00:00:00Z', ...over });

function setup(profileOver) {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.ANTHROPIC_API_KEY = 'a';
  create.mockReset();
  create.mockResolvedValue({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ items: [], recommendations: [] }) }] });
  sb = fakeSupabase((state) => {
    if (state.table === 'profiles' && state.op === 'select') {
      return { data: { is_premium: true, goal: 'maintain', calorie_target: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, menu_scans_used: 0, menu_scans_period_start: todayIso, ...profileOver }, error: null };
    }
    return { data: [], error: null };
  }, { user: { id: 'u1', email: 'someone@example.test' } });
}
const promptOf = () => create.mock.calls[0][0].messages[0].content.find((b) => b.type === 'text').text;
const scan = () => handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { image: 'AAAA', mediaType: 'image/jpeg' } }, fakeRes());

describe('recognize-menu uses the temporary calorie limit for what is left today', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a Pro member inside a limit gets recommendations against the limit and its scaled macros', async () => {
    setup({ calorie_limit_periods: [limit()] });
    await scan();
    expect(promptOf()).toContain('- 1500 kcal');
    expect(promptOf()).toContain('- 113g protein'); // 150 * 1500/2000 = 112.5, rounded
  });

  it('without a limit it uses the normal target', async () => {
    setup({ calorie_limit_periods: [] });
    await scan();
    expect(promptOf()).toContain('- 2000 kcal');
    expect(promptOf()).toContain('- 150g protein');
  });

  it('a limit that has ended is ignored', async () => {
    setup({ calorie_limit_periods: [limit({ start: '2020-01-01', end: '2020-02-01' })] });
    await scan();
    expect(promptOf()).toContain('- 2000 kcal');
  });

  it('a limit does not apply to a non-Pro account', async () => {
    setup({ is_premium: false, calorie_limit_periods: [limit()] });
    await scan();
    expect(promptOf()).toContain('- 2000 kcal');
  });
});
