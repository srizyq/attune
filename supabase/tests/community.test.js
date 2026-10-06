import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

async function member(db, name, { isPrivate = true, age = 30, discoverable = true, goal = 'maintain', username, dob } = {}) {
  const id = await addUser(db, name);
  await db.query(`update public.profiles set age = $2, goal = $3, date_of_birth = $4 where id = $1`, [id, age, goal, dob ?? null]);
  await as(db, id, `insert into public.community_profiles (user_id, username, display_name, is_private, discoverable) values ($1, $2, $3, $4, $5)`,
    [id, username || name.toLowerCase(), name, isPrivate, discoverable]);
  return id;
}
const payload = (over = {}) => ({ title: 'Chicken bowl', calories: 640, protein_g: 46, carbs_g: 52, fat_g: 26, items: [{ name: 'Chicken', calories: 300 }], ...over });
async function post(db, uid, { kind = 'meal', audience = 'public', payload: pl = payload(), note = '' } = {}) {
  const r = await as(db, uid, `insert into public.community_posts (author_id, kind, audience, payload, note) values ($1, $2, $3, $4::jsonb, $5) returning id`,
    [uid, kind, audience, JSON.stringify(pl), note]);
  return r.rows[0].id;
}
const follow = (db, a, b) => as(db, a, `insert into public.community_follows (follower_id, followee_id) values ($1, $2)`, [a, b]);
const status = async (db, a, b) => (await db.query(`select status from public.community_follows where follower_id = $1 and followee_id = $2`, [a, b])).rows[0]?.status;
const feed = async (db, uid, args = '50') => (await as(db, uid, `select * from public.community_feed_cards(${args})`)).rows;
const canSee = async (db, viewer, postId) => (await as(db, viewer, `select id from public.community_posts where id = $1`, [postId])).rows.length === 1;
const moderator = async (db, name) => {
  const id = await member(db, name, { isPrivate: false });
  await db.query(`insert into public.community_moderators (user_id) values ($1)`, [id]);
  return id;
};

describe('joining Community', () => {
  it('needs a known age of 16 or more', async () => {
    const db = await createDb();
    await rejects(member(db, 'Kid', { age: 15 }), /community_too_young/);
    await rejects(member(db, 'Unknown', { age: null }), /community_age_required/);
    await rejects(member(db, 'Teen', { age: null, dob: new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10) }), /community_too_young/);
    await member(db, 'Sixteen', { age: 16 });
    await member(db, 'Grown', { age: null, dob: '1990-01-01' });
  }, 60000);

  it('starts private, and validates the username, bio and name', async () => {
    const db = await createDb();
    const u = await addUser(db, 'Sam');
    await db.query(`update public.profiles set age = 30 where id = $1`, [u]);
    await as(db, u, `insert into public.community_profiles (user_id, username, display_name) values ($1, 'Sam.K', 'Sam')`, [u]);
    const row = (await db.query(`select * from public.community_profiles where user_id = $1`, [u])).rows[0];
    expect(row.is_private).toBe(true);
    expect(row.discoverable).toBe(true);
    expect(row.username).toBe('sam.k'); // lower-cased
    const bad = (name, bio = '') => as(db, u, `update public.community_profiles set ${name ? 'username' : 'bio'} = $1 where user_id = $2`, [name || bio, u]);
    await rejects(bad('ab'), /community_username_format/);
    await rejects(bad('has space'), /community_username_format/);
    await rejects(bad('_lead'), /community_username_format/);
    await rejects(bad('a'.repeat(21)), /community_username_format/);
    await rejects(bad('admin'), /community_username_reserved/);
    await rejects(bad(null, 'see me at www.example'), /community_bio_no_links/);
    await rejects(bad(null, 'x'.repeat(161)), /community_bio_len/);
  }, 60000);

  it('usernames are unique', async () => {
    const db = await createDb();
    await member(db, 'Sam');
    await rejects(member(db, 'Sam2', { username: 'sam' }), /duplicate key|community_profiles_username_key/);
  }, 60000);

  it('a username can be changed once every 30 days', async () => {
    const db = await createDb();
    const u = await member(db, 'Sam');
    await as(db, u, `update public.community_profiles set username = 'sam2' where user_id = $1`, [u]);
    await rejects(as(db, u, `update public.community_profiles set username = 'sam3' where user_id = $1`, [u]), /community_username_locked/);
    await db.query(`update public.community_profiles set username_changed_at = now() - interval '31 days' where user_id = $1`, [u]);
    await as(db, u, `update public.community_profiles set username = 'sam3' where user_id = $1`, [u]);
    // Other edits aren't affected by the lock.
    await as(db, u, `update public.community_profiles set bio = 'hello' where user_id = $1`, [u]);
  }, 60000);

  it('a client cannot ban itself back in or edit its own moderation fields', async () => {
    const db = await createDb();
    const u = await member(db, 'Sam');
    await as(db, u, `update public.community_profiles set banned_at = now() where user_id = $1`, [u]);
    expect((await db.query(`select banned_at from public.community_profiles where user_id = $1`, [u])).rows[0].banned_at).toBeNull();
  }, 60000);
});

describe('following', () => {
  it('a public account is followed straight away, a private one waits for approval', async () => {
    const db = await createDb();
    const pub = await member(db, 'Pub', { isPrivate: false });
    const priv = await member(db, 'Priv');
    const fan = await member(db, 'Fan');
    await follow(db, fan, pub);
    await follow(db, fan, priv);
    expect(await status(db, fan, pub)).toBe('accepted');
    expect(await status(db, fan, priv)).toBe('pending');
  }, 60000);

  it('a client cannot pick its own status, approve itself or follow itself', async () => {
    const db = await createDb();
    const priv = await member(db, 'Priv');
    const fan = await member(db, 'Fan');
    await as(db, fan, `insert into public.community_follows (follower_id, followee_id, status) values ($1, $2, 'accepted')`, [fan, priv]);
    expect(await status(db, fan, priv)).toBe('pending');
    await as(db, fan, `update public.community_follows set status = 'accepted' where follower_id = $1`, [fan]);
    expect(await status(db, fan, priv)).toBe('pending');
    await rejects(follow(db, fan, fan), /community_follows_check|violates check/);
  }, 60000);

  it('only the person followed can approve, and it only goes pending to accepted', async () => {
    const db = await createDb();
    const priv = await member(db, 'Priv');
    const fan = await member(db, 'Fan');
    await follow(db, fan, priv);
    await as(db, priv, `update public.community_follows set status = 'accepted' where followee_id = $1`, [priv]);
    expect(await status(db, fan, priv)).toBe('accepted');
    await rejects(as(db, priv, `update public.community_follows set status = 'pending' where followee_id = $1`, [priv]), /community_follow_update_not_allowed/);
  }, 60000);

  it('either side can end it, and going public approves the waiting', async () => {
    const db = await createDb();
    const priv = await member(db, 'Priv');
    const a = await member(db, 'Amy');
    const b = await member(db, 'Bea');
    await follow(db, a, priv);
    await follow(db, b, priv);
    await as(db, priv, `update public.community_profiles set is_private = false where user_id = $1`, [priv]);
    expect(await status(db, a, priv)).toBe('accepted');
    expect(await status(db, b, priv)).toBe('accepted');
    await as(db, a, `delete from public.community_follows where follower_id = $1`, [a]);
    await as(db, priv, `delete from public.community_follows where followee_id = $1`, [priv]);
    expect(await status(db, a, priv)).toBeUndefined();
    expect(await status(db, b, priv)).toBeUndefined();
  }, 60000);

  it('cannot follow someone blocked, banned, or not in Community', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy', { isPrivate: false });
    const b = await member(db, 'Bea', { isPrivate: false });
    await as(db, a, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    await rejects(follow(db, b, a), /community_blocked/);
    await rejects(follow(db, a, b), /community_blocked/);
    const outsider = await addUser(db, 'Outsider');
    await rejects(follow(db, a, outsider), /community_user_not_found/);
    await rejects(follow(db, outsider, a), /community_user_not_found/);
  }, 60000);
});

describe('who can see a post', () => {
  it('public posts reach any member; followers-only posts reach accepted followers; neither reaches outsiders', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const follower = await member(db, 'Follower');
    const stranger = await member(db, 'Stranger');
    const outsider = await addUser(db, 'Outsider');
    await follow(db, follower, author);
    const pub = await post(db, author, { audience: 'public' });
    const fol = await post(db, author, { audience: 'followers' });
    expect(await canSee(db, author, fol)).toBe(true);
    expect(await canSee(db, follower, pub)).toBe(true);
    expect(await canSee(db, follower, fol)).toBe(true);
    expect(await canSee(db, stranger, pub)).toBe(true);
    expect(await canSee(db, stranger, fol)).toBe(false);
    expect(await canSee(db, outsider, pub)).toBe(false);
  }, 60000);

  it('a pending follower sees nothing private', async () => {
    const db = await createDb();
    const author = await member(db, 'Author');
    const fan = await member(db, 'Fan');
    await follow(db, fan, author);
    const p = await post(db, author);
    expect(await canSee(db, fan, p)).toBe(false);
    await as(db, author, `update public.community_follows set status = 'accepted' where followee_id = $1`, [author]);
    expect(await canSee(db, fan, p)).toBe(true);
  }, 60000);

  it('a private account can only post to followers, even if it asks for public', async () => {
    const db = await createDb();
    const author = await member(db, 'Author');
    const p = await post(db, author, { audience: 'public' });
    expect((await db.query(`select audience from public.community_posts where id = $1`, [p])).rows[0].audience).toBe('followers');
  }, 60000);

  it('going private pulls public posts back; going public leaves old ones as they were', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const stranger = await member(db, 'Stranger');
    const pubPost = await post(db, author, { audience: 'public' });
    const folPost = await post(db, author, { audience: 'followers' });
    expect(await canSee(db, stranger, pubPost)).toBe(true);
    await as(db, author, `update public.community_profiles set is_private = true where user_id = $1`, [author]);
    expect(await canSee(db, stranger, pubPost)).toBe(false);
    await as(db, author, `update public.community_profiles set is_private = false where user_id = $1`, [author]);
    expect(await canSee(db, stranger, pubPost)).toBe(false);
    expect(await canSee(db, stranger, folPost)).toBe(false);
    const fresh = await post(db, author, { audience: 'public' });
    expect(await canSee(db, stranger, fresh)).toBe(true);
  }, 60000);

  it('blocking hides posts both ways, banned authors vanish, hidden posts show only to their author', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const viewer = await member(db, 'Viewer');
    const p = await post(db, author);
    expect(await canSee(db, viewer, p)).toBe(true);
    await as(db, viewer, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [viewer, author]);
    expect(await canSee(db, viewer, p)).toBe(false);
    const own = await post(db, viewer);
    expect(await canSee(db, author, own)).toBe(false); // hidden from the blocked person too
    await as(db, viewer, `delete from public.community_blocks where blocker_id = $1`, [viewer]);
    expect(await canSee(db, viewer, p)).toBe(true);
    await db.query(`update public.community_posts set hidden = true where id = $1`, [p]);
    expect(await canSee(db, viewer, p)).toBe(false);
    expect(await canSee(db, author, p)).toBe(true);
    await db.query(`update public.community_posts set hidden = false where id = $1`, [p]);
    await db.query(`update public.community_profiles set banned_at = now() where user_id = $1`, [author]);
    expect(await canSee(db, viewer, p)).toBe(false);
  }, 60000);

  it('anonymous visitors see nothing', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    await post(db, author);
    await db.exec(`set role anon`);
    try {
      expect((await db.query(`select * from public.community_posts`)).rows).toEqual([]);
      expect((await db.query(`select * from public.community_profiles`)).rows).toEqual([]);
      await expect(db.query(`select * from public.community_feed_cards(10)`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from public.community_explore()`)).rejects.toThrow(/permission denied/);
    } finally { await db.exec(`reset role`); }
  }, 60000);
});

describe('writing posts', () => {
  it('the numbers never change after posting; the note, photo and audience can', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const p = await post(db, author);
    await as(db, author, `update public.community_posts set payload = $2::jsonb, kind = 'day', note = 'tasty', created_at = '2020-01-01' where id = $1`,
      [p, JSON.stringify(payload({ calories: 1 }))]);
    const row = (await db.query(`select * from public.community_posts where id = $1`, [p])).rows[0];
    expect(row.payload.calories).toBe(640);
    expect(row.kind).toBe('meal');
    expect(row.note).toBe('tasty');
    expect(row.edited_at).not.toBeNull();
    expect(new Date(row.created_at).getFullYear()).not.toBe(2020);
    await as(db, author, `update public.community_posts set audience = 'followers' where id = $1`, [p]);
    expect((await db.query(`select audience from public.community_posts where id = $1`, [p])).rows[0].audience).toBe('followers');
  }, 60000);

  it('rejects bad numbers, links in notes, and other people as author', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const other = await member(db, 'Other', { isPrivate: false });
    await rejects(post(db, author, { payload: payload({ calories: 99999 }) }), /community_post_payload_valid/);
    await rejects(post(db, author, { payload: { calories: 100 } }), /community_post_payload_valid/);
    await rejects(post(db, author, { kind: 'recipe', payload: payload() }), /community_post_payload_valid/); // a recipe needs ingredients
    await post(db, author, { kind: 'recipe', payload: payload({ items: undefined, ingredients: [{ name: 'Oats' }] }) });
    await rejects(post(db, author, { note: 'buy at https://x.example' }), /community_links_not_allowed/);
    await rejects(post(db, author, { note: 'x'.repeat(201) }), /community_posts_note_check|violates check/);
    await rejects(as(db, author, `insert into public.community_posts (author_id, kind, payload) values ($1, 'meal', $2::jsonb)`, [other, JSON.stringify(payload())]), /row-level security/);
  }, 60000);

  it('limits posting to 20 a day', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    for (let i = 0; i < 20; i += 1) await post(db, author);
    await rejects(post(db, author), /community_rate_limited/);
  }, 60000);

  it('a photo starts pending and the author cannot approve it', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const r = await as(db, author, `insert into public.community_posts (author_id, kind, payload, photo_path, photo_status) values ($1, 'meal', $2::jsonb, $3, 'approved') returning id, photo_status`,
      [author, JSON.stringify(payload()), `${author}/a.jpg`]);
    expect(r.rows[0].photo_status).toBe('pending');
    await as(db, author, `update public.community_posts set photo_status = 'approved' where id = $1`, [r.rows[0].id]);
    expect((await db.query(`select photo_status from public.community_posts where id = $1`, [r.rows[0].id])).rows[0].photo_status).toBe('pending');
    await db.query(`update public.community_posts set photo_status = 'approved' where id = $1`, [r.rows[0].id]); // the screening step (service)
    expect((await db.query(`select photo_status from public.community_posts where id = $1`, [r.rows[0].id])).rows[0].photo_status).toBe('approved');
    await as(db, author, `update public.community_posts set photo_path = null where id = $1`, [r.rows[0].id]);
    expect((await db.query(`select photo_status from public.community_posts where id = $1`, [r.rows[0].id])).rows[0].photo_status).toBe('none');
  }, 60000);

  it('only the author can delete a post', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const other = await member(db, 'Other', { isPrivate: false });
    const p = await post(db, author);
    await as(db, other, `delete from public.community_posts where id = $1`, [p]);
    expect((await db.query(`select id from public.community_posts`)).rows).toHaveLength(1);
    await as(db, author, `delete from public.community_posts where id = $1`, [p]);
    expect((await db.query(`select id from public.community_posts`)).rows).toHaveLength(0);
  }, 60000);
});

describe('hearts, flames, saves and copies', () => {
  it('only on posts you can see; the poster sees who, everyone else a count', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const a = await member(db, 'Amy');
    const b = await member(db, 'Bea');
    const hidden = await post(db, author, { audience: 'followers' });
    const p = await post(db, author);
    await rejects(as(db, a, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [hidden, a]), /row-level security/);
    await as(db, a, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [p, a]);
    await as(db, a, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'flame')`, [p, a]);
    await as(db, b, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [p, b]);
    await rejects(as(db, b, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [p, b]), /duplicate key/);
    expect((await as(db, author, `select user_id from public.community_reactions where post_id = $1`, [p])).rows).toHaveLength(3);
    expect((await as(db, b, `select user_id from public.community_reactions where post_id = $1`, [p])).rows).toHaveLength(1);
    const card = (await as(db, b, `select * from public.community_cards(array[$1]::uuid[])`, [p])).rows[0];
    expect([card.hearts, card.flames, card.my_heart, card.my_flame]).toEqual([2, 1, true, false]);
    await as(db, a, `delete from public.community_reactions where post_id = $1 and user_id = $2 and kind = 'flame'`, [p, a]);
    expect((await as(db, b, `select flames from public.community_cards(array[$1]::uuid[])`, [p])).rows[0].flames).toBe(0);
  }, 60000);

  it('saves are private and copies count up, but not your own and not unseen posts', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const fan = await member(db, 'Fan');
    const hidden = await post(db, author, { audience: 'followers' });
    const p = await post(db, author);
    await as(db, fan, `insert into public.community_saves (user_id, post_id) values ($1, $2)`, [fan, p]);
    await rejects(as(db, fan, `insert into public.community_saves (user_id, post_id) values ($1, $2)`, [fan, hidden]), /row-level security/);
    expect((await as(db, author, `select * from public.community_saves`)).rows).toHaveLength(0);
    expect((await as(db, fan, `select id, saved from public.community_saved_cards()`)).rows).toEqual([{ id: p, saved: true }]);
    await as(db, fan, `insert into public.community_copies (post_id, copier_id) values ($1, $2)`, [p, fan]);
    await rejects(as(db, fan, `insert into public.community_copies (post_id, copier_id) values ($1, $2)`, [hidden, fan]), /row-level security/);
    await rejects(as(db, author, `insert into public.community_copies (post_id, copier_id) values ($1, $2)`, [p, author]), /row-level security/);
    expect((await as(db, fan, `select copies from public.community_cards(array[$1]::uuid[])`, [p])).rows[0].copies).toBe(1);
  }, 60000);
});

describe('blocking', () => {
  it('removes follows both ways and hides each person from the other everywhere', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy', { isPrivate: false });
    const b = await member(db, 'Bea', { isPrivate: false });
    await follow(db, a, b);
    await follow(db, b, a);
    await as(db, a, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    expect(await status(db, a, b)).toBeUndefined();
    expect(await status(db, b, a)).toBeUndefined();
    for (const [viewer, target] of [[a, 'bea'], [b, 'amy']]) {
      expect((await as(db, viewer, `select * from public.community_profile($1)`, [target])).rows).toHaveLength(0);
      expect((await as(db, viewer, `select * from public.community_search($1)`, [target])).rows).toHaveLength(0);
      expect((await as(db, viewer, `select * from public.community_explore()`)).rows).toHaveLength(0);
      expect((await as(db, viewer, `select * from public.community_profiles where user_id <> $1`, [viewer])).rows).toHaveLength(0);
    }
  }, 60000);

  it('only the blocker can see or lift a block', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy');
    const b = await member(db, 'Bea');
    await as(db, a, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    expect((await as(db, b, `select * from public.community_blocks`)).rows).toHaveLength(0);
    await as(db, b, `delete from public.community_blocks`);
    expect((await db.query(`select * from public.community_blocks`)).rows).toHaveLength(1);
    await rejects(as(db, b, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]), /row-level security/);
  }, 60000);
});

describe('feed, profiles and finding people', () => {
  it('the feed is your posts plus people you follow, newest first, paged, without hidden posts', async () => {
    const db = await createDb();
    const me = await member(db, 'Meg');
    const friend = await member(db, 'Friend', { isPrivate: false });
    const stranger = await member(db, 'Stranger', { isPrivate: false });
    await follow(db, me, friend);
    const p1 = await post(db, friend);
    const p2 = await post(db, me);
    const p3 = await post(db, friend);
    await post(db, stranger);
    await db.query(`update public.community_posts set created_at = now() - interval '3 hours' where id = $1`, [p1]);
    await db.query(`update public.community_posts set created_at = now() - interval '2 hours' where id = $1`, [p2]);
    await db.query(`update public.community_posts set created_at = now() - interval '1 hours' where id = $1`, [p3]);
    expect((await feed(db, me)).map((r) => r.id)).toEqual([p3, p2, p1]);
    const before = (await db.query(`select created_at from public.community_posts where id = $1`, [p3])).rows[0].created_at.toISOString();
    expect((await feed(db, me, `10, '${before}'`)).map((r) => r.id)).toEqual([p2, p1]);
    expect((await feed(db, me, '1')).map((r) => r.id)).toEqual([p3]);
    await db.query(`update public.community_posts set hidden = true where id = $1`, [p3]);
    expect((await feed(db, me)).map((r) => r.id)).toEqual([p2, p1]);
    const card = (await feed(db, me))[0];
    expect(card.username).toBe('meg');
    expect(card.hearts).toBe(0);
  }, 60000);

  it('a private profile shows a stranger only the basics; a follower sees more', async () => {
    const db = await createDb();
    const priv = await member(db, 'Priv', { goal: 'build' });
    const stranger = await member(db, 'Stranger');
    const fan = await member(db, 'Fan');
    await follow(db, fan, priv);
    await as(db, priv, `update public.community_follows set status = 'accepted' where follower_id = $1`, [fan]);
    await post(db, priv);
    await db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name) values ($1, current_date, 'lunch', 'x')`, [priv]);
    const seen = async (viewer) => (await as(db, viewer, `select * from public.community_profile('priv')`)).rows[0];
    const strangerView = await seen(stranger);
    expect(strangerView).toMatchObject({ username: 'priv', posts: 1, followers: 1, relation: 'none', goal_type: null, streak: null });
    expect((await as(db, stranger, `select * from public.community_user_cards($1)`, [priv])).rows).toHaveLength(0);
    const fanView = await seen(fan);
    expect(fanView).toMatchObject({ relation: 'following', goal_type: 'build', streak: 1 });
    expect((await as(db, fan, `select * from public.community_user_cards($1)`, [priv])).rows).toHaveLength(1);
    expect((await seen(priv)).relation).toBe('self');
    await follow(db, stranger, priv);
    expect((await seen(stranger)).relation).toBe('requested');
  }, 60000);

  it('streak counts consecutive days ending today or yesterday', async () => {
    const db = await createDb();
    const u = await member(db, 'Streaker');
    const streak = async (today = '2026-10-10') => (await db.query(`select public.community_streak($1, $2::date) s`, [u, today])).rows[0].s;
    expect(await streak()).toBe(0);
    for (const d of ['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06']) {
      await db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name) values ($1, $2, 'lunch', 'x')`, [u, d]);
    }
    expect(await streak()).toBe(3);
    expect(await streak('2026-10-11')).toBe(3); // yesterday still counts
    expect(await streak('2026-10-13')).toBe(0);
  }, 60000);

  it('search finds by username prefix or display name, ignores one-letter searches, includes private accounts', async () => {
    const db = await createDb();
    const me = await member(db, 'Meg');
    await member(db, 'Maya', { username: 'maya.k' });
    await member(db, 'Jordan', { username: 'jt99', isPrivate: false });
    await member(db, 'Priya', { username: 'p_mod' });
    const find = async (q) => (await as(db, me, `select username from public.community_search($1)`, [q])).rows.map((r) => r.username);
    expect(await find('may')).toEqual(['maya.k']);
    expect(await find('jord')).toEqual(['jt99']);
    expect(await find('p_')).toEqual(['p_mod']);
    expect(await find('m')).toEqual([]);
    expect(await find('me')).toEqual([]); // not yourself
    expect(await find('%%')).toEqual([]);
  }, 60000);

  it('explore lists public, discoverable accounts; sorts by recent or followers; filters by goal and word', async () => {
    const db = await createDb();
    const me = await member(db, 'Meg');
    const lose = await member(db, 'Lose', { isPrivate: false, goal: 'lose' });
    const build = await member(db, 'Build', { isPrivate: false, goal: 'build' });
    await member(db, 'Hidden', { isPrivate: false, discoverable: false });
    await member(db, 'Priv');
    const banned = await member(db, 'Banned', { isPrivate: false });
    await db.query(`update public.community_profiles set banned_at = now() where user_id = $1`, [banned]);
    const names = async (args = '') => (await as(db, me, `select username from public.community_explore(${args})`)).rows.map((r) => r.username);
    await post(db, lose);
    await db.query(`update public.community_posts set created_at = now() - interval '2 days'`);
    await post(db, build);
    expect(await names()).toEqual(['build', 'lose']);
    for (let i = 0; i < 2; i += 1) { const f = await member(db, `Fan${i}`); await follow(db, f, lose); }
    expect(await names(`'followed'`)).toEqual(['lose', 'build']);
    expect(await names(`'recent', 'lose'`)).toEqual(['lose']);
    expect(await names(`'recent', null, 'bui'`)).toEqual(['build']);
    expect((await as(db, me, `select goal_type from public.community_explore('recent', 'build')`)).rows).toEqual([{ goal_type: 'build' }]);
    expect(await names(`'recent', null, null, 1, 1`)).toEqual(['lose']);
  }, 60000);

  it('suggestions put friends-of-friends first and skip people you follow', async () => {
    const db = await createDb();
    const me = await member(db, 'Meg');
    const friend = await member(db, 'Friend', { isPrivate: false });
    const known = await member(db, 'Known', { isPrivate: false });
    const randoms = [await member(db, 'Rand1', { isPrivate: false }), await member(db, 'Rand2', { isPrivate: false })];
    await post(db, randoms[0]);
    await follow(db, me, friend);
    await follow(db, friend, known);
    const names = async () => (await as(db, me, `select username from public.community_suggestions()`)).rows.map((r) => r.username);
    const out = await names();
    expect(out[0]).toBe('known');
    expect(out).not.toContain('friend');
    expect(out).not.toContain('me');
    expect(out).toHaveLength(3);
  }, 60000);

  it('follow requests and the followers / following lists', async () => {
    const db = await createDb();
    const priv = await member(db, 'Priv');
    const fan = await member(db, 'Fan');
    const stranger = await member(db, 'Stranger');
    await follow(db, fan, priv);
    expect((await as(db, priv, `select username from public.community_follow_requests()`)).rows).toEqual([{ username: 'fan' }]);
    expect((await as(db, fan, `select * from public.community_follow_requests()`)).rows).toHaveLength(0);
    await as(db, priv, `update public.community_follows set status = 'accepted' where followee_id = $1`, [priv]);
    expect((await as(db, priv, `select username from public.community_follow_list($1, 'followers')`, [priv])).rows).toEqual([{ username: 'fan' }]);
    expect((await as(db, fan, `select username from public.community_follow_list($1, 'followers')`, [priv])).rows).toEqual([{ username: 'fan' }]);
    expect((await as(db, stranger, `select * from public.community_follow_list($1, 'followers')`, [priv])).rows).toHaveLength(0);
    expect((await as(db, fan, `select username from public.community_follow_list($1, 'following')`, [fan])).rows).toEqual([{ username: 'priv' }]);
  }, 60000);
});

describe('reports and moderation', () => {
  it('a report records the post as it was, once per person, and hides the post after three people report it', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const r = [await member(db, 'Rea'), await member(db, 'Reb'), await member(db, 'Rec')];
    const p = await post(db, author, { note: 'original' });
    const report = (u) => as(db, u, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $1, 'spam') returning id`, [u, p]);
    await report(r[0]);
    const row = (await db.query(`select * from public.community_reports`)).rows[0];
    expect(row.reported_user_id).toBe(author); // not whatever the reporter claimed
    expect(row.post_snapshot.note).toBe('original');
    expect(row.status).toBe('open');
    await rejects(report(r[0]), /duplicate key/);
    await report(r[1]);
    expect((await db.query(`select hidden from public.community_posts where id = $1`, [p])).rows[0].hidden).toBe(false);
    await report(r[2]);
    expect((await db.query(`select hidden from public.community_posts where id = $1`, [p])).rows[0].hidden).toBe(true);
    expect(await canSee(db, r[0], p)).toBe(false);
    expect(await canSee(db, author, p)).toBe(true);
  }, 60000);

  it('cannot report your own post or one you cannot see; reports are private to the reporter', async () => {
    const db = await createDb();
    const author = await member(db, 'Author');
    const other = await member(db, 'Other');
    const p = await post(db, author);
    await rejects(as(db, other, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $3, 'spam')`, [other, p, author]), /row-level security/);
    await rejects(as(db, author, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $3, 'spam')`, [author, p, author]), /community_reports_check|violates check/);
    const pub = await post(db, author, { audience: 'followers' });
    await as(db, other, `insert into public.community_reports (reporter_id, reported_user_id, reason, details) values ($1, $2, 'harassment', 'rude profile')`, [other, author]);
    expect((await as(db, other, `select * from public.community_reports`)).rows).toHaveLength(1);
    expect((await as(db, author, `select * from public.community_reports`)).rows).toHaveLength(0);
    expect(pub).toBeTruthy();
  }, 60000);

  it('only moderators can read reports or act on them', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const reporter = await member(db, 'Reporter');
    const mod = await moderator(db, 'Moddy');
    const p = await post(db, author);
    await as(db, reporter, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $3, 'inappropriate_photo')`, [reporter, p, author]);
    expect((await as(db, reporter, `select * from public.community_mod_reports()`)).rows).toHaveLength(0);
    await rejects(as(db, reporter, `select public.community_mod_set_post_hidden($1, true)`, [p]), /community_not_a_moderator/);
    await rejects(as(db, reporter, `select public.community_mod_delete_post($1)`, [p]), /community_not_a_moderator/);
    await rejects(as(db, reporter, `select public.community_mod_set_banned($1, true)`, [author]), /community_not_a_moderator/);
    expect((await as(db, reporter, `select * from public.community_moderators`)).rows).toHaveLength(0);
    await as(db, reporter, `insert into public.community_moderators (user_id) values ($1)`, [reporter]).then(() => { throw new Error('should not insert'); }, () => {});

    const list = (await as(db, mod, `select * from public.community_mod_reports()`)).rows;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'inappropriate_photo', reporter_username: 'reporter', reported_username: 'author', post_hidden: false });

    await as(db, mod, `select public.community_mod_set_post_hidden($1, true)`, [p]);
    expect((await db.query(`select hidden from public.community_posts where id = $1`, [p])).rows[0].hidden).toBe(true);
    expect((await db.query(`select status from public.community_reports`)).rows[0].status).toBe('actioned');
    expect(await canSee(db, mod, p)).toBe(true); // moderators can still see it to review
    await as(db, mod, `select public.community_mod_set_post_hidden($1, false)`, [p]);
    expect(await canSee(db, reporter, p)).toBe(true);
  }, 60000);

  it('a moderator can delete a post, ban a user, and resolve a report', async () => {
    const db = await createDb();
    const author = await member(db, 'Author', { isPrivate: false });
    const reporter = await member(db, 'Reporter');
    const viewer = await member(db, 'Viewer');
    const mod = await moderator(db, 'Moddy');
    const p1 = await post(db, author);
    await post(db, author);
    await as(db, reporter, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $3, 'spam')`, [reporter, p1, author]);
    const reportId = (await db.query(`select id from public.community_reports`)).rows[0].id;
    await rejects(as(db, mod, `select public.community_mod_resolve_report($1, 'whatever')`, [reportId]), /community_bad_status/);
    await as(db, mod, `select public.community_mod_resolve_report($1, 'dismissed')`, [reportId]);
    expect((await as(db, mod, `select * from public.community_mod_reports('open')`)).rows).toHaveLength(0);
    expect((await as(db, mod, `select * from public.community_mod_reports('dismissed')`)).rows).toHaveLength(1);

    await as(db, mod, `select public.community_mod_delete_post($1)`, [p1]);
    expect((await db.query(`select id from public.community_posts where id = $1`, [p1])).rows).toHaveLength(0);
    expect((await db.query(`select post_id from public.community_reports`)).rows[0].post_id).toBeNull(); // the report survives

    await as(db, mod, `select public.community_mod_set_banned($1, true)`, [author]);
    expect((await as(db, viewer, `select * from public.community_explore()`)).rows.map((r) => r.username)).toEqual(['moddy']);
    expect((await as(db, viewer, `select * from public.community_profile('author')`)).rows).toHaveLength(0);
    await rejects(post(db, author), /community_not_a_member/);
    await rejects(follow(db, viewer, author), /community_user_not_found/);
    await as(db, author, `update public.community_profiles set bio = 'let me back' where user_id = $1`, [author]);
    expect((await db.query(`select bio from public.community_profiles where user_id = $1`, [author])).rows[0].bio).toBe('');
    await as(db, mod, `select public.community_mod_set_banned($1, false)`, [author]);
    expect((await as(db, viewer, `select * from public.community_profile('author')`)).rows).toHaveLength(1);
  }, 60000);
});

describe('leaving', () => {
  it('deleting the account removes everything of theirs', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy', { isPrivate: false });
    const b = await member(db, 'Bea', { isPrivate: false });
    const p = await post(db, a);
    await follow(db, b, a);
    await as(db, b, `insert into public.community_reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [p, b]);
    await as(db, b, `insert into public.community_saves (user_id, post_id) values ($1, $2)`, [b, p]);
    await as(db, b, `insert into public.community_reports (reporter_id, post_id, reported_user_id, reason) values ($1, $2, $3, 'spam')`, [b, p, a]);
    await db.query(`delete from auth.users where id = $1`, [a]);
    for (const t of ['community_profiles', 'community_posts', 'community_reactions', 'community_saves', 'community_reports']) {
      const rows = (await db.query(`select * from public.${t}`)).rows;
      expect(rows.filter((r) => r.user_id === a || r.author_id === a || r.reported_user_id === a || r.post_id === p), t).toHaveLength(0);
    }
    expect(await status(db, b, a)).toBeUndefined();
    expect((await db.query(`select * from public.community_profiles where user_id = $1`, [b])).rows).toHaveLength(1);
  }, 60000);

  it('leaving Community (deleting the profile) takes the posts with it', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy', { isPrivate: false });
    await post(db, a);
    await as(db, a, `delete from public.community_profiles where user_id = $1`, [a]);
    // The posts reference the account, not the profile — so the app deletes them as part of leaving.
    await as(db, a, `delete from public.community_posts where author_id = $1`, [a]);
    expect((await db.query(`select * from public.community_posts`)).rows).toHaveLength(0);
  }, 60000);
});

describe('the on/off switch', () => {
  it('is off for everyone until switched on, except listed testers', async () => {
    const db = await createDb();
    const a = await member(db, 'Ann');
    const b = await member(db, 'Bob');
    const access = async (u) => (await as(db, u, `select public.community_access() v`)).rows[0].v;
    expect(await access(a)).toBe(false);
    await db.query(`insert into public.community_testers (user_id) values ($1)`, [b]);
    expect(await access(a)).toBe(false);
    expect(await access(b)).toBe(true);
    await db.query(`update public.app_settings set community_enabled = true`);
    expect(await access(a)).toBe(true);
    expect((await as(db, a, `select * from public.community_testers`)).rows).toHaveLength(0);
    const kid = await addUser(db, 'Kid');
    await db.query(`update public.profiles set age = 15 where id = $1`, [kid]);
    expect(await access(kid)).toBe(false);
    await db.query(`update public.profiles set age = null, date_of_birth = '2012-01-01' where id = $1`, [kid]);
    expect(await access(kid)).toBe(false);
    await db.query(`update public.profiles set age = null, date_of_birth = null where id = $1`, [kid]);
    expect(await access(kid)).toBe(true); // unknown age: the join screen asks
    await db.exec(`set role anon`);
    try { await expect(db.query(`select public.community_access()`)).rejects.toThrow(/permission denied/); } finally { await db.exec(`reset role`); }
  }, 60000);
});

describe('the blocked list', () => {
  it('shows only your own blocks, newest first, and survives the block hiding their profile', async () => {
    const db = await createDb();
    const a = await member(db, 'Amy');
    const b = await member(db, 'Bea');
    const c = await member(db, 'Cat');
    await as(db, a, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    await db.query(`update public.community_blocks set created_at = now() - interval '1 day'`);
    await as(db, a, `insert into public.community_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, c]);
    expect((await as(db, a, `select username from public.community_blocked_list()`)).rows.map((r) => r.username)).toEqual(['cat', 'bea']);
    expect((await as(db, b, `select * from public.community_blocked_list()`)).rows).toHaveLength(0);
    // Unblocking is a plain delete, and the person is back in the world.
    await as(db, a, `delete from public.community_blocks where blocked_id = $1`, [b]);
    expect((await as(db, a, `select username from public.community_blocked_list()`)).rows.map((r) => r.username)).toEqual(['cat']);
    expect((await as(db, a, `select * from public.community_profile('bea')`)).rows).toHaveLength(1);
  }, 60000);
});
