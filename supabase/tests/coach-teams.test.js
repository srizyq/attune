import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const team = async (db, uid) => (await as(db, uid, `select public.get_my_team() t`)).rows[0].t;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 'Olive Owner', { coachPass: true });
  const mate = await addUser(db, 'Mia Mate', { coachPass: true });
  const mate2 = await addUser(db, 'Max Mate', { coachPass: true });
  const outsider = await addUser(db, 'Otto Outsider', { coachPass: true });
  const nopass = await addUser(db, 'Nina NoPass');
  const client = await addUser(db, 'Sam Client');
  return { db, owner, mate, mate2, outsider, nopass, client };
}
const makeTeam = (db, uid, name = 'Clinic') => as(db, uid, `select public.create_coach_team($1) id`, [name]).then((r) => r.rows[0].id);
const invite = async (db, uid) => (await as(db, uid, `select * from public.create_team_invite()`)).rows[0];
async function joined(db, owner, ...others) {
  await makeTeam(db, owner);
  for (const u of others) {
    const { code } = await invite(db, owner);
    await as(db, u, `select public.redeem_team_invite($1)`, [code]);
  }
}
const link = (db, trainer, client, status = 'active') =>
  svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, $3, ${status === 'active' ? 'now()' : 'null'})`, [trainer, client, status]);

describe('create_coach_team', () => {
  it('lets a Coach Pass holder create a team and become its owner', async () => {
    const { db, owner } = await setup();
    await makeTeam(db, owner, '  Northside Clinic  ');
    const t = await team(db, owner);
    expect(t).toMatchObject({ name: 'Northside Clinic', is_owner: true, max_members: 25 });
    expect(t.members).toHaveLength(1);
    expect(t.members[0]).toMatchObject({ name: 'Olive Owner', role: 'owner', client_count: 0, has_pass: true });
  }, 60000);

  it('needs a Coach Pass, a name, and no existing team', async () => {
    const { db, owner, nopass } = await setup();
    await expect(makeTeam(db, nopass)).rejects.toThrow('A Coach Pass is required');
    await expect(makeTeam(db, owner, '   ')).rejects.toThrow('Give the team a name');
    await makeTeam(db, owner);
    await expect(makeTeam(db, owner, 'Second')).rejects.toThrow('already in a team');
  }, 60000);

  it('truncates an over-long name rather than storing it whole', async () => {
    const { db, owner } = await setup();
    await makeTeam(db, owner, 'x'.repeat(200));
    expect((await team(db, owner)).name).toHaveLength(60);
  }, 60000);

  it('accepts comp\'d coaches, whose pass is not the Stripe flag', async () => {
    const db = await createDb();
    const { rows } = await db.query(`insert into auth.users (email) values ('csrreddy9@gmail.com') returning id`);
    await db.query(`insert into public.profiles (id, name) values ($1, 'Comp Coach')`, [rows[0].id]);
    await makeTeam(db, rows[0].id);
    expect((await team(db, rows[0].id)).is_owner).toBe(true);
  }, 60000);
});

describe('get_my_team', () => {
  it('is null for someone not on a team', async () => {
    const { db, owner } = await setup();
    expect(await team(db, owner)).toBeNull();
  }, 60000);

  it('shows teammates with a client COUNT only — never client names', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, mate, client);
    await link(db, mate, await addUser(db, 'Pat Pending'), 'pending'); // pending doesn't count
    const t = await team(db, owner);
    expect(t.members.map((m) => [m.name, m.role, m.client_count])).toEqual([['Olive Owner', 'owner', 0], ['Mia Mate', 'member', 1]]);
    expect(JSON.stringify(t)).not.toMatch(/Sam Client|Pat Pending/);
  }, 60000);

  it('shows open invites to the owner only', async () => {
    const { db, owner, mate } = await setup();
    await joined(db, owner, mate);
    await invite(db, owner);
    expect((await team(db, owner)).invites).toHaveLength(1);
    expect((await team(db, mate)).invites).toEqual([]);
    expect((await team(db, mate)).is_owner).toBe(false);
  }, 60000);

  it('never leaks another team', async () => {
    const { db, owner, outsider } = await setup();
    await makeTeam(db, owner, 'Ours');
    await makeTeam(db, outsider, 'Theirs');
    expect((await team(db, owner)).name).toBe('Ours');
    expect((await team(db, outsider)).members.map((m) => m.name)).toEqual(['Otto Outsider']);
  }, 60000);

  it('the tables can\'t be read or written directly — only through the functions', async () => {
    const { db, owner, mate, outsider } = await setup();
    await joined(db, owner, mate);
    for (const t of ['coach_teams', 'coach_team_members', 'coach_team_invites']) {
      expect((await as(db, owner, `select * from public.${t}`)).rows, t).toEqual([]);
    }
    const teamId = (await svc(db, `select id from public.coach_teams`)).rows[0].id;
    // Writing straight to the tables is refused (no policy allows it) ...
    await expect(as(db, owner, `insert into public.coach_teams (name, owner_id) values ('Rogue', $1)`, [owner])).rejects.toThrow(/row-level security/);
    await expect(as(db, outsider, `insert into public.coach_team_members (user_id, team_id, role) values ($1, $2, 'member')`, [outsider, teamId])).rejects.toThrow(/row-level security/);
    await expect(as(db, outsider, `insert into public.coach_team_invites (team_id, code, created_by) values ($1, 'AAAAAAAA', $2)`, [teamId, outsider])).rejects.toThrow(/row-level security/);
    // ... and updates or deletes quietly match nothing, so a member can't promote themselves.
    await as(db, mate, `update public.coach_team_members set role = 'owner' where user_id = $1`, [mate]);
    await as(db, mate, `delete from public.coach_team_members where user_id = $1`, [owner]);
    expect((await svc(db, `select role from public.coach_team_members where user_id = $1`, [mate])).rows[0].role).toBe('member');
    expect((await svc(db, `select count(*)::int c from public.coach_team_members`)).rows[0].c).toBe(2);
  }, 60000);
});

describe('team invites', () => {
  it('creates 8-character codes, for the owner only', async () => {
    const { db, owner, mate } = await setup();
    await joined(db, owner, mate);
    const inv = await invite(db, owner);
    expect(inv.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(invite(db, mate)).rejects.toThrow('Only the team owner');
  }, 60000);

  it('caps open invites at 10', async () => {
    const { db, owner } = await setup();
    await makeTeam(db, owner);
    for (let i = 0; i < 10; i++) await invite(db, owner);
    await expect(invite(db, owner)).rejects.toThrow('10 open invites');
  }, 60000);

  it('clamps the expiry window to 1-30 days', async () => {
    const { db, owner } = await setup();
    await makeTeam(db, owner);
    const days = async (n) => Number((await as(db, owner, `select extract(epoch from (expires_at - now())) / 86400 as d from public.create_team_invite($1)`, [n])).rows[0].d);
    expect(await days(9999)).toBeGreaterThan(29.9);
    expect(await days(9999)).toBeLessThanOrEqual(30);
    expect(await days(-5)).toBeGreaterThan(0.9);
    expect(await days(-5)).toBeLessThanOrEqual(1);
    expect(await days(null)).toBeGreaterThan(6.9); // default 7
  }, 60000);

  it('is single-use: joining consumes it', async () => {
    const { db, owner, mate, mate2 } = await setup();
    await makeTeam(db, owner);
    const { code } = await invite(db, owner);
    await as(db, mate, `select public.redeem_team_invite($1)`, [code.toLowerCase() + ' ']); // case / spaces forgiven
    await expect(as(db, mate2, `select public.redeem_team_invite($1)`, [code])).rejects.toThrow('invalid or no longer active');
    expect((await team(db, owner)).members).toHaveLength(2);
    expect((await team(db, owner)).invites).toEqual([]);
  }, 60000);

  it('refuses expired, revoked and unknown codes, with one message that reveals nothing', async () => {
    const { db, owner, mate } = await setup();
    await makeTeam(db, owner);
    const a = await invite(db, owner);
    await svc(db, `update public.coach_team_invites set expires_at = now() - interval '1 minute' where id = $1`, [a.id]);
    const b = await invite(db, owner);
    await as(db, owner, `select public.revoke_team_invite($1)`, [b.id]);
    for (const code of [a.code, b.code, 'ZZZZZZZZ', '']) {
      await expect(as(db, mate, `select public.redeem_team_invite($1)`, [code])).rejects.toThrow(code === '' ? 'Enter an invite code' : 'invalid or no longer active');
    }
  }, 60000);

  it('needs the joiner to hold their own Coach Pass and not already be on a team', async () => {
    const { db, owner, mate, nopass, outsider } = await setup();
    await makeTeam(db, owner);
    await makeTeam(db, outsider, 'Other');
    const { code } = await invite(db, owner);
    await expect(as(db, nopass, `select public.redeem_team_invite($1)`, [code])).rejects.toThrow('A Coach Pass is required');
    await expect(as(db, outsider, `select public.redeem_team_invite($1)`, [code])).rejects.toThrow('already in a team');
    await as(db, mate, `select public.redeem_team_invite($1)`, [code]); // still works for a valid person
  }, 60000);

  it('stops at 25 members', async () => {
    const { db, owner, mate } = await setup();
    await makeTeam(db, owner);
    const teamId = (await svc(db, `select id from public.coach_teams`)).rows[0].id;
    for (let i = 0; i < 24; i++) {
      const u = await addUser(db, `Filler ${i}`, { coachPass: true });
      await svc(db, `insert into public.coach_team_members (user_id, team_id) values ($1, $2)`, [u, teamId]);
    }
    const { code } = await invite(db, owner);
    await expect(as(db, mate, `select public.redeem_team_invite($1)`, [code])).rejects.toThrow('That team is full');
  }, 120000);

  it('only the owner can revoke, and only their own team\'s invites', async () => {
    const { db, owner, mate, outsider } = await setup();
    await joined(db, owner, mate);
    await makeTeam(db, outsider, 'Other');
    const inv = await invite(db, owner);
    await as(db, mate, `select public.revoke_team_invite($1)`, [inv.id]);
    await as(db, outsider, `select public.revoke_team_invite($1)`, [inv.id]);
    expect((await svc(db, `select revoked_at from public.coach_team_invites where id = $1`, [inv.id])).rows[0].revoked_at).toBeNull();
    await as(db, owner, `select public.revoke_team_invite($1)`, [inv.id]);
    expect((await svc(db, `select revoked_at from public.coach_team_invites where id = $1`, [inv.id])).rows[0].revoked_at).not.toBeNull();
  }, 60000);
});

describe('leaving, removing, deleting', () => {
  it('a member can leave; the owner cannot', async () => {
    const { db, owner, mate } = await setup();
    await joined(db, owner, mate);
    await expect(as(db, owner, `select public.leave_coach_team()`)).rejects.toThrow('remove the team instead');
    await as(db, mate, `select public.leave_coach_team()`);
    expect(await team(db, mate)).toBeNull();
    expect((await team(db, owner)).members).toHaveLength(1);
    await expect(as(db, mate, `select public.leave_coach_team()`)).rejects.toThrow('not in a team');
  }, 60000);

  it('a former member can then join another team', async () => {
    const { db, owner, mate, outsider } = await setup();
    await joined(db, owner, mate);
    await as(db, mate, `select public.leave_coach_team()`);
    await makeTeam(db, outsider, 'Other');
    const { code } = await invite(db, outsider);
    await as(db, mate, `select public.redeem_team_invite($1)`, [code]);
    expect((await team(db, mate)).name).toBe('Other');
  }, 60000);

  it('the owner can remove a member, but not themselves, and nobody else can remove anyone', async () => {
    const { db, owner, mate, mate2, outsider } = await setup();
    await joined(db, owner, mate, mate2);
    await expect(as(db, mate, `select public.remove_team_member($1)`, [mate2])).rejects.toThrow('Only the team owner');
    await expect(as(db, owner, `select public.remove_team_member($1)`, [owner])).rejects.toThrow('remove the team instead');
    await expect(as(db, owner, `select public.remove_team_member($1)`, [outsider])).rejects.toThrow('not on your team');
    await as(db, owner, `select public.remove_team_member($1)`, [mate]);
    expect((await team(db, owner)).members.map((m) => m.name)).toEqual(['Olive Owner', 'Max Mate']);
    expect(await team(db, mate)).toBeNull();
  }, 60000);

  it('the owner can delete the team, which takes members and invites with it', async () => {
    const { db, owner, mate } = await setup();
    await joined(db, owner, mate);
    await invite(db, owner);
    await expect(as(db, mate, `select public.delete_coach_team()`)).rejects.toThrow('Only the team owner');
    await as(db, owner, `select public.delete_coach_team()`);
    expect(await team(db, owner)).toBeNull();
    expect(await team(db, mate)).toBeNull();
    for (const t of ['coach_teams', 'coach_team_members', 'coach_team_invites']) expect((await svc(db, `select count(*)::int c from public.${t}`)).rows[0].c, t).toBe(0);
  }, 60000);

  it('leaving, removal and deletion never touch anyone\'s coaching links', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, mate, client);
    await as(db, mate, `select public.leave_coach_team()`);
    await as(db, owner, `select public.delete_coach_team()`);
    expect((await svc(db, `select status from public.trainer_clients where trainer_id = $1 and client_id = $2`, [mate, client])).rows[0].status).toBe('active');
  }, 60000);
});

describe('share_client_with_teammate — consent is preserved', () => {
  const share = (db, who, client, mate) => as(db, who, `select public.share_client_with_teammate($1, $2) id`, [client, mate]);

  it('creates a PENDING link, and the teammate can see nothing until the client accepts', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Secret salad', 300)`, [client]);
    await svc(db, `insert into public.weight_logs (user_id, logged_date, weight, unit) values ($1, current_date, 80, 'kg')`, [client]);

    const { rows } = await share(db, owner, client, mate);
    expect((await svc(db, `select status, referred_by, consented_at from public.trainer_clients where id = $1`, [rows[0].id])).rows[0]).toMatchObject({ status: 'pending', referred_by: owner, consented_at: null });

    // Nothing readable while pending.
    expect((await as(db, mate, `select * from public.food_logs where user_id = $1`, [client])).rows).toEqual([]);
    expect((await as(db, mate, `select * from public.weight_logs where user_id = $1`, [client])).rows).toEqual([]);
    expect((await as(db, mate, `select * from public.profiles where id = $1`, [client])).rows).toEqual([]);

    // The client accepts through the normal consent function; now it opens.
    await as(db, client, `select public.respond_to_coach_link($1, true)`, [rows[0].id]);
    expect((await as(db, mate, `select food_name from public.food_logs where user_id = $1`, [client])).rows).toEqual([{ food_name: 'Secret salad' }]);
  }, 60000);

  it('a client who declines is not asked again by anyone on the team', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    const { rows } = await share(db, owner, client, mate);
    await as(db, client, `select public.respond_to_coach_link($1, false)`, [rows[0].id]);
    await expect(share(db, owner, client, mate)).rejects.toThrow('already ended coaching with that teammate');
    expect((await svc(db, `select status from public.trainer_clients where trainer_id = $1`, [mate])).rows[0].status).toBe('revoked');
  }, 60000);

  it('refuses a duplicate, a link already active, and sharing with yourself', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    await share(db, owner, client, mate);
    await expect(share(db, owner, client, mate)).rejects.toThrow('already connected');
    await expect(share(db, owner, client, owner)).rejects.toThrow('You already coach this client');
  }, 60000);

  it('only works for a client you actively coach', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await expect(share(db, owner, client, mate)).rejects.toThrow('Not an active trainer');
    await link(db, owner, client, 'pending');
    await expect(share(db, owner, client, mate)).rejects.toThrow('Not an active trainer');
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [owner]);
    await expect(share(db, owner, client, mate)).rejects.toThrow('Not an active trainer');
    // A teammate who coaches someone else's client can't share that one.
    await link(db, mate, client);
    await expect(share(db, owner, client, mate)).rejects.toThrow('Not an active trainer');
  }, 60000);

  it('only to someone on your own team, who has a Coach Pass', async () => {
    const { db, owner, mate, outsider, nopass, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    await expect(share(db, owner, client, outsider)).rejects.toThrow("isn't on your team");
    await expect(share(db, owner, client, nopass)).rejects.toThrow("isn't on your team");
    await svc(db, `update public.profiles set coach_pass = false where id = $1`, [mate]);
    await expect(share(db, owner, client, mate)).rejects.toThrow('needs a Coach Pass');
  }, 60000);

  it('needs both people on the same team, and a stranger cannot use it at all', async () => {
    const { db, owner, mate, outsider, client } = await setup();
    await makeTeam(db, owner);
    await makeTeam(db, outsider, 'Other');
    await link(db, owner, client);
    await expect(share(db, outsider, client, mate)).rejects.toThrow('Not an active trainer');
    await expect(share(db, owner, client, outsider)).rejects.toThrow("isn't on your team");
  }, 60000);

  it('the client is told who suggested the new coach', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    await share(db, owner, client, mate);
    const links = (await as(db, client, `select * from public.get_my_coach_links()`)).rows;
    const pending = links.find((l) => l.status === 'pending');
    expect(pending).toMatchObject({ trainer_name: 'Mia Mate', referred_by_name: 'Olive Owner' });
    expect(links.find((l) => l.status === 'active').referred_by_name).toBeNull();
  }, 60000);
});

describe('get_client_coaches', () => {
  const coaches = (db, who, client) => as(db, who, `select * from public.get_client_coaches($1)`, [client]).then((r) => r.rows.map((x) => [x.trainer_name, x.status]));

  it('lists teammates on your client (pending and active), and only them', async () => {
    const { db, owner, mate, mate2, outsider, client } = await setup();
    await joined(db, owner, mate, mate2);
    await link(db, owner, client);
    await as(db, owner, `select public.share_client_with_teammate($1, $2)`, [client, mate]);
    await link(db, mate2, client);
    await link(db, outsider, client); // coaches the same client but is NOT on the team
    expect((await coaches(db, owner, client)).sort()).toEqual([['Max Mate', 'active'], ['Mia Mate', 'pending']]);
  }, 60000);

  it('returns nothing for a client you don\'t actively coach, or when you are on no team', async () => {
    const { db, owner, mate, outsider, client } = await setup();
    await joined(db, owner, mate);
    await link(db, mate, client);
    expect(await coaches(db, owner, client)).toEqual([]);        // owner doesn't coach this client
    await link(db, outsider, client);
    expect(await coaches(db, outsider, client)).toEqual([]);     // no team
    await link(db, owner, client, 'pending');
    expect(await coaches(db, owner, client)).toEqual([]);        // pending isn't enough
  }, 60000);

  it('does not include revoked links', async () => {
    const { db, owner, mate, client } = await setup();
    await joined(db, owner, mate);
    await link(db, owner, client);
    await link(db, mate, client);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [mate]);
    expect(await coaches(db, owner, client)).toEqual([]);
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Coach teams (schema update');
    expect(block).toContain('share_client_with_teammate');
    await db.exec(block);
    await db.exec(block);
  }, 60000);

  it('re-running the whole file (older blocks, then this one) converges instead of erroring', async () => {
    const db = await createDb();
    // The situation when someone pastes schema.sql into the SQL editor again:
    // the older consent block first, then the newer teams block, both over a
    // database that already has the newer function.
    await db.exec(sliceMigration('Coach consent + per-client invites'));
    await db.exec(sliceMigration('Coach tools: private notes'));
    await db.exec(sliceMigration('Coach teams (schema update'));
    const cols = (await db.query(`select pg_get_function_result('public.get_my_coach_links'::regproc) r`)).rows[0].r;
    expect(cols).toContain('referred_by_name');
  }, 120000);

  it('still supports everything the client consent screen already used', async () => {
    const { db, owner, client } = await setup();
    await link(db, owner, client);
    const [row] = (await as(db, client, `select * from public.get_my_coach_links()`)).rows;
    expect(row).toMatchObject({ trainer_name: 'Olive Owner', status: 'active' });
    expect(Object.keys(row)).toEqual(expect.arrayContaining(['id', 'status', 'created_at', 'consented_at', 'trainer_id', 'trainer_name', 'trainer_logo_url', 'referred_by_name']));
  }, 60000);
});
