// Test doubles shared by the api/*.test.js files: a chainable fake of the
// Supabase query builder (records every filter/write, answers from a
// per-test resolver) and a minimal req/res. Underscore-prefixed so Vercel
// never deploys it.
export function fakeSupabase(resolve, { user = { id: 'caller' }, authError = null } = {}) {
  const calls = [];
  const builder = (table) => {
    const state = { table, op: 'select', filters: {}, payload: null, single: false, order: null, limit: null };
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (ok, fail) => {
            calls.push(state);
            return Promise.resolve(resolve(state)).then(ok, fail);
          };
        }
        return (...args) => {
          if (prop === 'eq' || prop === 'in' || prop === 'lte' || prop === 'gte') state.filters[args[0]] = args[1];
          else if (prop === 'update' || prop === 'insert' || prop === 'delete' || prop === 'upsert') { state.op = prop; state.payload = args[0]; }
          else if (prop === 'maybeSingle' || prop === 'single') state.single = true;
          else if (prop === 'order') state.order = args;
          else if (prop === 'limit') state.limit = args[0];
          return chain;
        };
      },
    });
    return chain;
  };
  return {
    calls,
    from: builder,
    rpc: (name, args) => { const state = { table: `rpc:${name}`, op: 'rpc', filters: {}, payload: args }; calls.push(state); return Promise.resolve(resolve(state)); },
    auth: { getUser: async () => (authError ? { data: {}, error: authError } : { data: { user }, error: null }) },
  };
}

export function fakeRes() {
  return { code: null, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
}
