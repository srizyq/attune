import { describe, it, expect } from 'vitest';
import { parseVerdict, decide, handle, toBase64, MODEL } from './index.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const POST = '22222222-2222-4222-8222-222222222222';
const env = (extra = {}) => (k) => ({ SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'ak', ...extra })[k];
const JPEG = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);

// A fake network: routes by URL + method, records every call.
function network({ user = { id: USER }, post, profile, file = { type: 'image/jpeg', bytes: JPEG }, model = { ok: true, text: '{"safe":true,"food":true,"reason":"a meal"}' } } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url: String(url), method, body: init.body });
    const u = String(url);
    if (u.includes('/auth/v1/user')) return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
    if (u.includes('/rest/v1/community_posts') && method === 'GET') return new Response(JSON.stringify(post ? [post] : []), { status: 200 });
    if (u.includes('/rest/v1/community_profiles') && method === 'GET') return new Response(JSON.stringify(profile ? [profile] : []), { status: 200 });
    if (u.includes('/rest/v1/') && method === 'PATCH') return new Response(null, { status: 204 });
    if (u.includes('/storage/v1/object/') && method === 'GET') return file ? new Response(file.bytes, { status: 200, headers: { 'content-type': file.type } }) : new Response('x', { status: 404 });
    if (u.includes('/storage/v1/object/') && method === 'DELETE') return new Response('{}', { status: 200 });
    if (u.includes('api.anthropic.com')) return model.ok ? new Response(JSON.stringify({ content: [{ type: 'text', text: model.text }] }), { status: 200 }) : new Response('{}', { status: 500 });
    throw new Error(`unexpected ${method} ${u}`);
  };
  return { f, calls };
}
const req = (body, { token = 'tok', method = 'POST' } = {}) => new Request('https://fn.test/screen-photo', { method, headers: { authorization: token ? `Bearer ${token}` : '', 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const run = (body, net, e = env(), opts) => handle(req(body, opts), { fetch: net.f, env: e });
const postRow = (over = {}) => ({ author_id: USER, photo_path: `${USER}/p.jpg`, photo_status: 'pending', ...over });

describe('parseVerdict / decide', () => {
  it('reads the JSON even with chatter around it, and refuses anything unclear', () => {
    expect(parseVerdict('{"safe":true,"food":true,"reason":"pasta"}')).toEqual({ safe: true, food: true, reason: 'pasta' });
    expect(parseVerdict('Sure! {"safe": false, "food": true} done')).toMatchObject({ safe: false, food: true });
    for (const bad of [null, undefined, '', 'safe', '{}', '{"safe":"yes","food":true}', '{"safe":true}', '{nope}', 42]) expect(parseVerdict(bad), String(bad)).toBeNull();
  });
  it('a post photo needs safe and food; an avatar needs only safe; no answer decides nothing', () => {
    const v = (safe, food) => ({ safe, food, reason: '' });
    expect(decide(v(true, true), 'post')).toBe('approved');
    expect(decide(v(true, false), 'post')).toBe('rejected');
    expect(decide(v(false, true), 'post')).toBe('rejected');
    expect(decide(v(true, false), 'avatar')).toBe('approved');
    expect(decide(v(false, false), 'avatar')).toBe('rejected');
    expect(decide(null, 'post')).toBeNull();
  });
  it('toBase64 handles big files', () => {
    const big = new Uint8Array(200000).fill(65);
    expect(toBase64(big).length).toBe(Math.ceil(200000 / 3) * 4);
    expect(toBase64(new Uint8Array([72, 105]))).toBe('SGk=');
  });
});

describe('the screening function', () => {
  it('approves a safe food photo: marks it, keeps the file, and sends the right request to the model', async () => {
    const net = network({ post: postRow() });
    const res = await run({ kind: 'post', post_id: POST }, net);
    expect(await res.json()).toEqual({ status: 'approved' });
    const patch = net.calls.find((c) => c.method === 'PATCH');
    expect(patch.url).toContain(`community_posts?id=eq.${POST}`);
    expect(JSON.parse(patch.body)).toEqual({ photo_status: 'approved' });
    expect(net.calls.some((c) => c.method === 'DELETE')).toBe(false);
    const ask = JSON.parse(net.calls.find((c) => c.url.includes('anthropic')).body);
    expect(ask.model).toBe(MODEL);
    expect(ask.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
  });

  it('rejects a photo that is not food, and deletes the file', async () => {
    const net = network({ post: postRow(), model: { ok: true, text: '{"safe":true,"food":false,"reason":"a selfie"}' } });
    expect(await (await run({ kind: 'post', post_id: POST }, net)).json()).toEqual({ status: 'rejected' });
    expect(JSON.parse(net.calls.find((c) => c.method === 'PATCH').body)).toEqual({ photo_status: 'rejected' });
    expect(net.calls.find((c) => c.method === 'DELETE').url).toContain(`community-photos/${USER}/p.jpg`);
  });

  it('rejects an unsafe photo', async () => {
    const net = network({ post: postRow(), model: { ok: true, text: '{"safe":false,"food":true,"reason":"x"}' } });
    expect((await (await run({ kind: 'post', post_id: POST }, net)).json()).status).toBe('rejected');
  });

  it('leaves a photo pending when the model fails or gives a muddled answer', async () => {
    for (const model of [{ ok: false }, { ok: true, text: 'I cannot help with that' }, { ok: true, text: '{"safe":true}' }]) {
      const net = network({ post: postRow(), model });
      const res = await run({ kind: 'post', post_id: POST }, net);
      expect(res.status).toBe(502);
      expect((await res.json()).status).toBe('pending');
      expect(net.calls.some((c) => c.method === 'PATCH' || c.method === 'DELETE')).toBe(false);
    }
  });

  it('rejects files that are not JPEG/WebP or are too big, without asking the model', async () => {
    for (const file of [{ type: 'image/png', bytes: JPEG }, { type: 'image/jpeg', bytes: new Uint8Array(3 * 1024 * 1024) }, { type: 'image/jpeg', bytes: new Uint8Array(0) }]) {
      const net = network({ post: postRow(), file });
      expect((await (await run({ kind: 'post', post_id: POST }, net)).json()).status).toBe('rejected');
      expect(net.calls.some((c) => c.url.includes('anthropic'))).toBe(false);
    }
  });

  it('only the author, only while pending, only their own folder', async () => {
    const other = network({ post: postRow({ author_id: '33333333-3333-4333-8333-333333333333' }) });
    expect((await run({ kind: 'post', post_id: POST }, other)).status).toBe(404);
    const done = network({ post: postRow({ photo_status: 'approved' }) });
    expect(await (await run({ kind: 'post', post_id: POST }, done)).json()).toEqual({ status: 'approved' });
    expect(done.calls.some((c) => c.url.includes('anthropic'))).toBe(false);
    const elsewhere = network({ post: postRow({ photo_path: `someone-else/p.jpg` }) });
    expect((await run({ kind: 'post', post_id: POST }, elsewhere)).status).toBe(404);
    const none = network({ post: postRow({ photo_path: null }) });
    expect(await (await run({ kind: 'post', post_id: POST }, none)).json()).toEqual({ status: 'none' });
    const missing = network({});
    expect((await run({ kind: 'post', post_id: POST }, missing)).status).toBe(404);
  });

  it('a profile picture only needs to be safe', async () => {
    const net = network({ profile: { avatar_path: `${USER}/avatar-1.jpg`, avatar_status: 'pending' }, model: { ok: true, text: '{"safe":true,"food":false,"reason":"a person"}' } });
    expect(await (await run({ kind: 'avatar' }, net)).json()).toEqual({ status: 'approved' });
    const patch = net.calls.find((c) => c.method === 'PATCH');
    expect(patch.url).toContain(`community_profiles?user_id=eq.${USER}`);
    expect(JSON.parse(patch.body)).toEqual({ avatar_status: 'approved' });
  });

  it('refuses callers who are not signed in, or bad requests, or a missing key', async () => {
    expect((await run({ kind: 'post', post_id: POST }, network({ post: postRow() }), env(), { token: '' })).status).toBe(401);
    expect((await run({ kind: 'post', post_id: POST }, network({ user: null, post: postRow() }))).status).toBe(401);
    expect((await run({ kind: 'nope' }, network({ post: postRow() }))).status).toBe(400);
    expect((await run({ kind: 'post', post_id: 'x; drop table' }, network({ post: postRow() }))).status).toBe(400);
    expect((await run({ kind: 'post', post_id: POST }, network({ post: postRow() }), env({ ANTHROPIC_API_KEY: undefined }))).status).toBe(500);
    expect((await handle(req(null, { method: 'GET' }), { fetch: network().f, env: env() })).status).toBe(405);
    expect((await handle(req(null, { method: 'OPTIONS' }), { fetch: network().f, env: env() })).status).toBe(204);
  });
});
