import { Buffer } from 'node:buffer';
import { USER_ID, buildFoodLogs, buildProfile, buildWeightLogs, buildWorkouts, buildCheckins, CUSTOM_FOODS, FAVOURITES, SAVED_MEALS } from './fixtures.js';

const SUPABASE = 'https://fake.supabase.test';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function fakeSession(userOverrides = {}) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'alex@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
    is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', ...userOverrides,
  };
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.fake`,
    token_type: 'bearer', expires_in: 31536000, expires_at: exp, refresh_token: 'fake-refresh', user,
  };
}

function matches(row, key, spec) {
  const dot = spec.indexOf('.');
  const op = spec.slice(0, dot), raw = spec.slice(dot + 1);
  const v = row[key];
  const num = (x) => (typeof v === 'number' ? Number(x) : x);
  switch (op) {
    case 'eq': return String(v) === raw;
    case 'neq': return String(v) !== raw;
    case 'gt': return v > num(raw);
    case 'gte': return v >= num(raw);
    case 'lt': return v < num(raw);
    case 'lte': return v <= num(raw);
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v));
    case 'is': return raw === 'null' ? v == null : String(v) === raw;
    case 'ilike': case 'like': return String(v ?? '').toLowerCase().includes(raw.replace(/%/g, '').toLowerCase());
    default: return true;
  }
}

/**
 * Wires a Playwright context/page to a fake Supabase. `tables` can be
 * overridden per test (e.g. an empty account, or a trainer with clients).
 * Anything the app asks for that has no fixture is recorded in `unmocked`
 * so a new endpoint can't silently go untested.
 */
export async function installFakeBackend(context, { profile = {}, tables = {}, rpc = {}, session = {} } = {}) {
  const data = {
    profiles: [buildProfile(profile)],
    food_logs: buildFoodLogs(),
    weight_logs: buildWeightLogs(),
    workout_logs: buildWorkouts(),
    checkins: buildCheckins(),
    custom_foods: CUSTOM_FOODS,
    favourite_foods: FAVOURITES,
    saved_meals: SAVED_MEALS,
    trainer_clients: [], trainer_comments: [], trainer_notes: [], coach_invites: [], push_subscriptions: [],
    barcode_products: [], common_dishes: [], afcd_foods: [], ausnut_foods: [], meal_plans: [], body_measurements: [], progress_photos: [],
    ...tables,
  };
  const unmocked = [];
  const sess = fakeSession(session);
  await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } }, ['sb-fake-auth-token', JSON.stringify(sess)]);

  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) return json(sess.user);
      if (url.pathname.endsWith('/token')) return json(sess);
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      return json({});
    }

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      if (fn in rpc) return json(typeof rpc[fn] === 'function' ? rpc[fn](req) : rpc[fn]);
      return json([]);
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop();
      if (!(table in data)) { unmocked.push(`${req.method()} ${table}`); return json([]); }
      let rows = data[table];
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        for (const [key, spec] of url.searchParams) {
          if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
          if (key === 'or' || key === 'and' || spec.startsWith('not.')) continue;
          rows = rows.filter((row) => matches(row, key, spec));
        }
        const order = url.searchParams.get('order');
        if (order) {
          const keys = order.split(',').map((o) => { const [k, dir = 'asc'] = o.split('.'); return [k, dir === 'desc' ? -1 : 1]; });
          rows = [...rows].sort((a, b) => { for (const [k, d] of keys) { if (a[k] < b[k]) return -d; if (a[k] > b[k]) return d; } return 0; });
        }
        const limit = Number(url.searchParams.get('limit'));
        if (limit) rows = rows.slice(0, limit);
        const range = { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
        if ((req.headers().accept || '').includes('vnd.pgrst.object+json')) {
          return rows.length === 1 ? json(rows[0], 200, range) : json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406);
        }
        return req.method() === 'HEAD' ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', ...range } }) : json(rows, 200, range);
      }
      // Writes: echo back so the UI proceeds; nothing is persisted.
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ }
      const echoed = (Array.isArray(body) ? body : [body]).map((row, i) => ({ id: `new-${Date.now()}-${i}`, created_at: new Date().toISOString(), ...(rows[0] || {}), ...row }));
      if ((req.headers().accept || '').includes('vnd.pgrst.object+json')) return json(echoed[0], 201);
      return json(echoed, req.method() === 'POST' ? 201 : 200);
    }
    unmocked.push(`${req.method()} ${url.pathname}`);
    return json({});
  });

  // The app's own serverless functions don't exist under `vite dev`; without
  // this the SPA fallback would answer with index.html and break JSON parsing.
  await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  return { unmocked };
}
