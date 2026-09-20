import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

// Two-account scenario used throughout: a trainer with a Coach Pass, a
// client who connects through an invite, and an unrelated stranger.
async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  return { db, trainer, client, stranger };
}

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));

async function newInvite(db, trainer, label = null, days = 7) {
  const { rows } = await as(db, trainer, `select * from public.create_coach_invite($1, $2)`, [label, days]);
  return rows[0];
}
async function linkRow(db, trainer, client) {
  const { rows } = await svc(db, `select * from public.trainer_clients where trainer_id = $1 and client_id = $2`, [trainer, client]);
  return rows[0];
}
async function connectAndAccept(db, trainer, client) {
  const inv = await newInvite(db, trainer);
  await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);
  const link = await linkRow(db, trainer, client);
  await as(db, client, `select public.respond_to_coach_link($1, true)`, [link.id]);
  return linkRow(db, trainer, client);
}
const expectRejects = async (promise, message) => {
  await expect(promise).rejects.toThrow(message);
};

describe('a trainer cannot undo a client\'s decisions', () => {
  it('cannot flip a revoked link back to active', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await as(db, client, `update public.trainer_clients set status = 'revoked' where id = $1`, [link.id]);

    await as(db, trainer, `update public.trainer_clients set status = 'active' where id = $1`, [link.id]);

    expect((await linkRow(db, trainer, client)).status).toBe('revoked');
  }, 60000);

  it('cannot activate a pending link (consent bypass)', async () => {
    const { db, trainer, client } = await setup();
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);
    const link = await linkRow(db, trainer, client);
    expect(link.status).toBe('pending');

    await as(db, trainer, `update public.trainer_clients set status = 'active', consented_at = now() where id = $1`, [link.id]);

    const after = await linkRow(db, trainer, client);
    expect(after.status).toBe('pending');
    expect(after.consented_at).toBeNull();
  }, 60000);

  it('cannot set consented_at, and cannot force status back to pending', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await svc(db, `update public.trainer_clients set consented_at = null where id = $1`, [link.id]);

    await as(db, trainer, `update public.trainer_clients set consented_at = now(), status = 'pending' where id = $1`, [link.id]);

    const after = await linkRow(db, trainer, client);
    expect(after.consented_at).toBeNull();
    expect(after.status).toBe('active');
  }, 60000);

  it('cannot retarget a link onto another user (existing protection still holds)', async () => {
    const { db, trainer, client, stranger } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await as(db, trainer, `update public.trainer_clients set client_id = $2 where id = $1`, [link.id, stranger]);
    expect((await linkRow(db, trainer, client))).toBeTruthy();
    expect((await linkRow(db, trainer, stranger))).toBeUndefined();
  }, 60000);
});

describe('consent: a pending link grants the trainer nothing', () => {
  it('trainer sees no food/weight/profile until the client accepts, then does', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Secret salad', 300)`, [client]);
    await svc(db, `insert into public.weight_logs (user_id, logged_date, weight) values ($1, current_date, 80)`, [client]);

    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);

    const seenPending = async () => ({
      food: (await as(db, trainer, `select * from public.food_logs where user_id = $1`, [client])).rows.length,
      weight: (await as(db, trainer, `select * from public.weight_logs where user_id = $1`, [client])).rows.length,
      profile: (await as(db, trainer, `select * from public.profiles where id = $1`, [client])).rows.length,
    });
    expect(await seenPending()).toEqual({ food: 0, weight: 0, profile: 0 });

    const link = await linkRow(db, trainer, client);
    await as(db, client, `select public.respond_to_coach_link($1, true)`, [link.id]);
    expect(await seenPending()).toEqual({ food: 1, weight: 1, profile: 1 });
    expect((await linkRow(db, trainer, client)).consented_at).not.toBeNull();
  }, 60000);

  it('declining a pending invite revokes it and reveals nothing', async () => {
    const { db, trainer, client } = await setup();
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);
    const link = await linkRow(db, trainer, client);
    await as(db, client, `select public.respond_to_coach_link($1, false)`, [link.id]);
    expect((await linkRow(db, trainer, client)).status).toBe('revoked');
  }, 60000);

  it('only the client on a link can respond to it', async () => {
    const { db, trainer, client, stranger } = await setup();
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);
    const link = await linkRow(db, trainer, client);
    await expectRejects(as(db, stranger, `select public.respond_to_coach_link($1, true)`, [link.id]), 'Invitation not found');
    await expectRejects(as(db, trainer, `select public.respond_to_coach_link($1, true)`, [link.id]), 'Invitation not found');
    expect((await linkRow(db, trainer, client)).status).toBe('pending');
  }, 60000);

  it('grandfathered active links (no consented_at) keep working and can be acknowledged', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status) values ($1, $2, 'active')`, [trainer, client]);
    await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Toast', 100)`, [client]);

    expect((await as(db, trainer, `select * from public.food_logs where user_id = $1`, [client])).rows).toHaveLength(1);
    const link = await linkRow(db, trainer, client);
    expect(link.consented_at).toBeNull();

    await as(db, client, `select public.respond_to_coach_link($1, true)`, [link.id]);
    const after = await linkRow(db, trainer, client);
    expect(after.status).toBe('active');
    expect(after.consented_at).not.toBeNull();
  }, 60000);

  it('the client can still disconnect directly, and the trainer can too', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await as(db, trainer, `update public.trainer_clients set status = 'revoked' where id = $1`, [link.id]);
    expect((await linkRow(db, trainer, client)).status).toBe('revoked');
    // ...and revoked really is terminal for a direct write by either side.
    await as(db, client, `update public.trainer_clients set status = 'active' where id = $1`, [link.id]);
    expect((await linkRow(db, trainer, client)).status).toBe('revoked');
  }, 60000);

  it('get_pending_clients shows the trainer a first name only, and only their own', async () => {
    const { db, trainer, client, stranger } = await setup();
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);

    const mine = (await as(db, trainer, `select * from public.get_pending_clients()`)).rows;
    expect(mine).toHaveLength(1);
    expect(mine[0].client_name).toBe('Sam');
    expect(Object.keys(mine[0]).sort()).toEqual(['client_name', 'link_id', 'requested_at']);
    expect((await as(db, stranger, `select * from public.get_pending_clients()`)).rows).toHaveLength(0);
  }, 60000);

  it('group_label is the trainer\'s to set, not the client\'s', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await as(db, client, `update public.trainer_clients set group_label = 'hijacked' where id = $1`, [link.id]);
    expect((await linkRow(db, trainer, client)).group_label).toBeNull();
    await as(db, trainer, `update public.trainer_clients set group_label = 'Cut' where id = $1`, [link.id]);
    expect((await linkRow(db, trainer, client)).group_label).toBe('Cut');
  }, 60000);

  it('nobody can INSERT a link directly', async () => {
    const { db, trainer, client } = await setup();
    await expectRejects(as(db, client, `insert into public.trainer_clients (trainer_id, client_id, status) values ($1, $2, 'active')`, [trainer, client]), /row-level security/);
    await expectRejects(as(db, trainer, `insert into public.trainer_clients (trainer_id, client_id, status) values ($1, $2, 'active')`, [trainer, client]), /row-level security/);
  }, 60000);
});

describe('per-client invites', () => {
  it('need a Coach Pass to create', async () => {
    const { db, client } = await setup();
    await expectRejects(as(db, client, `select * from public.create_coach_invite()`), 'A Coach Pass is required');
  }, 60000);

  it('work for comp\'d coaches whose profiles.coach_pass is false', async () => {
    const db = await createDb();
    const comp = await addUser(db, 'Comp Coach');
    await db.query(`update auth.users set email = 'ErenHDeniz@gmail.com' where id = $1`, [comp]); // superuser: mirrors the SQL editor
    const { rows } = await as(db, comp, `select * from public.create_coach_invite('comp')`);
    expect(rows[0].code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  }, 60000);

  it('are single-use', async () => {
    const { db, trainer, client, stranger } = await setup();
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code.toLowerCase()]); // case-insensitive
    await expectRejects(as(db, stranger, `select public.redeem_coach_invite_code($1)`, [inv.code]), 'invalid or no longer active');
  }, 60000);

  it('expire', async () => {
    const { db, trainer, client } = await setup();
    const inv = await newInvite(db, trainer);
    await svc(db, `update public.coach_invites set expires_at = now() - interval '1 minute' where id = $1`, [inv.id]);
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]), 'invalid or no longer active');
  }, 60000);

  it('can be revoked, but only by their owner and only while unused', async () => {
    const { db, trainer, client, stranger } = await setup();
    const a = await newInvite(db, trainer);
    await as(db, stranger, `select public.revoke_coach_invite($1)`, [a.id]);
    expect((await svc(db, `select revoked_at from public.coach_invites where id = $1`, [a.id])).rows[0].revoked_at).toBeNull();
    await as(db, trainer, `select public.revoke_coach_invite($1)`, [a.id]);
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code($1)`, [a.code]), 'invalid or no longer active');
  }, 60000);

  it('stop working when the trainer loses their Coach Pass', async () => {
    const { db, trainer, client } = await setup();
    const inv = await newInvite(db, trainer);
    await svc(db, `update public.profiles set coach_pass = false where id = $1`, [trainer]);
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]), 'invalid or no longer active');
  }, 60000);

  it('cannot be redeemed by their own trainer', async () => {
    const { db, trainer } = await setup();
    const inv = await newInvite(db, trainer);
    await expectRejects(as(db, trainer, `select public.redeem_coach_invite_code($1)`, [inv.code]), 'your own coach account');
  }, 60000);

  it('do not burn when the client is already linked, and re-invite a revoked client', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    const spare = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [spare.code]);
    expect((await svc(db, `select redeemed_at from public.coach_invites where id = $1`, [spare.id])).rows[0].redeemed_at).toBeNull();
    expect((await linkRow(db, trainer, client)).status).toBe('active');

    await as(db, client, `update public.trainer_clients set status = 'revoked' where id = $1`, [link.id]);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [spare.code]);
    const after = await linkRow(db, trainer, client);
    expect(after.status).toBe('pending');
    expect(after.consented_at).toBeNull();
  }, 60000);

  it('are capped at 25 open invites, with clamped lifetime and trimmed labels', async () => {
    const { db, trainer } = await setup();
    const first = await newInvite(db, trainer, `  ${'x'.repeat(90)}  `, 999);
    expect(first.label).toHaveLength(60);
    const days = (new Date(first.expires_at) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30.01);
    for (let i = 0; i < 24; i++) await newInvite(db, trainer);
    await expectRejects(newInvite(db, trainer), '25 open invites');
  }, 90000);

  it('are readable only by their trainer and never writable directly', async () => {
    const { db, trainer, stranger } = await setup();
    const inv = await newInvite(db, trainer);
    expect((await as(db, trainer, `select * from public.coach_invites`)).rows).toHaveLength(1);
    expect((await as(db, stranger, `select * from public.coach_invites`)).rows).toHaveLength(0);
    await expectRejects(as(db, trainer, `insert into public.coach_invites (trainer_id, code) values ($1, 'FORGED222')`, [trainer]), /permission denied|row-level security/);
    await as(db, trainer, `update public.coach_invites set expires_at = now() + interval '5 years' where id = $1`, [inv.id]);
    const { rows } = await svc(db, `select expires_at from public.coach_invites where id = $1`, [inv.id]);
    expect(new Date(rows[0].expires_at) - Date.now()).toBeLessThan(8 * 86400000);
  }, 60000);
});

describe('the old shared per-trainer code', () => {
  it('still redeems, but now lands pending instead of instantly active', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set coach_invite_code = 'LEGACY22' where id = $1`, [trainer]);
    await as(db, client, `select public.redeem_coach_invite_code('legacy22')`);
    expect((await linkRow(db, trainer, client)).status).toBe('pending');
  }, 60000);

  it('is rejected once the trainer has no Coach Pass, and for unknown codes', async () => {
    const { db, trainer, client } = await setup();
    await svc(db, `update public.profiles set coach_invite_code = 'LEGACY22', coach_pass = false where id = $1`, [trainer]);
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code('LEGACY22')`), 'invalid or no longer active');
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code('NOPE')`), 'invalid or no longer active');
    await expectRejects(as(db, client, `select public.redeem_coach_invite_code('   ')`), 'Enter an invite code');
  }, 60000);
});

describe('signed-out callers', () => {
  it('cannot call any of the coach functions', async () => {
    const { db } = await setup();
    await db.exec(`set role anon`);
    try {
      for (const sql of [
        `select public.redeem_coach_invite_code('X')`,
        `select * from public.create_coach_invite()`,
        `select public.respond_to_coach_link(gen_random_uuid(), true)`,
        `select * from public.get_pending_clients()`,
      ]) {
        await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await db.exec(`reset role`);
    }
  }, 60000);
});

describe('get_my_coach_links', () => {
  it('shows a pending invitation\'s coach name and logo — and nothing else about them', async () => {
    const { db, trainer, client, stranger } = await setup();
    await svc(db, `update public.profiles set coach_logo_url = 'https://x.test/logo.png', weight = 91 where id = $1`, [trainer]);
    const inv = await newInvite(db, trainer);
    await as(db, client, `select public.redeem_coach_invite_code($1)`, [inv.code]);

    const rows = (await as(db, client, `select * from public.get_my_coach_links()`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', trainer_name: 'Trainer', trainer_logo_url: 'https://x.test/logo.png' });
    expect(Object.keys(rows[0]).sort()).toEqual(['consented_at', 'created_at', 'id', 'status', 'trainer_id', 'trainer_logo_url', 'trainer_name']);
    expect((await as(db, stranger, `select * from public.get_my_coach_links()`)).rows).toHaveLength(0);
    // The trainer isn't a "client" of themselves, so they see nothing here either.
    expect((await as(db, trainer, `select * from public.get_my_coach_links()`)).rows).toHaveLength(0);
  }, 60000);

  it('hides revoked links', async () => {
    const { db, trainer, client } = await setup();
    const link = await connectAndAccept(db, trainer, client);
    await as(db, client, `select public.respond_to_coach_link($1, false)`, [link.id]);
    expect((await as(db, client, `select * from public.get_my_coach_links()`)).rows).toHaveLength(0);
  }, 60000);
});

describe('migration hygiene', () => {
  it('can be re-run on a database that already has it (Supabase SQL editor re-runs)', async () => {
    const db = await createDb();
    const block = sliceMigration('Coach consent + per-client invites');
    expect(block).toContain('respond_to_coach_link');
    expect(block).toContain('get_my_coach_links');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
