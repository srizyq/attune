import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rows = async (db, uid, sql, params) => (await as(db, uid, sql, params)).rows;
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 'Olive Owner', { coachPass: true });
  const mate = await addUser(db, 'Mia Mate', { coachPass: true });
  const mate2 = await addUser(db, 'Max Mate', { coachPass: true });
  const outsider = await addUser(db, 'Otto Outsider', { coachPass: true });
  const otherOwner = await addUser(db, 'Opal Other', { coachPass: true });
  const kai = await addUser(db, 'Kai Client');      // Mia's client
  const lou = await addUser(db, 'Lou Client');      // Olive's own client
  const zed = await addUser(db, 'Zed Client');      // Otto's client (not on the team)
  const { rows: t } = await as(db, owner, `select public.create_coach_team('Clinic') id`);
  for (const u of [mate, mate2]) {
    const { rows: i } = await as(db, owner, `select * from public.create_team_invite()`);
    await as(db, u, `select public.redeem_team_invite($1)`, [i[0].code]);
  }
  await as(db, otherOwner, `select public.create_coach_team('Other clinic')`);
  const link = (trainer, client, status = 'active') => svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, $3, ${status === 'active' ? 'now()' : 'null'})`, [trainer, client, status]);
  await link(mate, kai); await link(owner, lou); await link(outsider, zed);
  await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Salmon', 300), ($2, current_date, 'lunch', 'Oats', 200), ($3, current_date, 'lunch', 'Rice', 100)`, [kai, lou, zed]);
  await svc(db, `insert into public.weight_logs (user_id, logged_date, weight, unit) values ($1, current_date, 80, 'kg')`, [kai]);
  await svc(db, `insert into public.checkins (user_id, checkin_date, mood) values ($1, current_date, 'good')`, [kai]);
  await svc(db, `insert into public.workout_logs (user_id, logged_date, type, intensity, duration_minutes) values ($1, current_date, 'Run', 'intense', 30)`, [kai]);
  await svc(db, `insert into public.body_measurements (user_id, logged_date, kind, value, unit) values ($1, current_date, 'waist', 80, 'cm')`, [kai]);
  await svc(db, `insert into public.progress_photos (user_id, taken_date, path) values ($1, current_date, $2)`, [kai, `${kai}/front.jpg`]);
  await svc(db, `insert into storage.objects (bucket_id, name, owner) values ('progress-photos', $1, $2)`, [`${kai}/front.jpg`, kai]);
  await svc(db, `insert into public.trainer_comments (trainer_id, client_id, body) values ($1, $2, 'private chat with Kai')`, [mate, kai]);
  await svc(db, `insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'Mia private note')`, [mate, kai]);
  return { db, owner, mate, mate2, outsider, otherOwner, kai, lou, zed, link, teamId: t[0].id };
}

describe('what the team owner can read', () => {
  it('sees a teammate\'s client the way that coach does: profile, food, weight, check-ins, workouts, measurements, photos', async () => {
    const { db, owner, kai } = await setup();
    expect((await rows(db, owner, `select name from public.profiles where id = $1`, [kai])).map((r) => r.name)).toEqual(['Kai Client']);
    expect((await rows(db, owner, `select food_name from public.food_logs where user_id = $1`, [kai])).map((r) => r.food_name)).toEqual(['Salmon']);
    for (const table of ['weight_logs', 'checkins', 'workout_logs', 'body_measurements', 'progress_photos']) {
      expect(await rows(db, owner, `select 1 from public.${table} where user_id = $1`, [kai]), table).toHaveLength(1);
    }
    expect(await rows(db, owner, `select 1 from storage.objects where bucket_id = 'progress-photos' and name = $1`, [`${kai}/front.jpg`])).toHaveLength(1);
  }, 60000);

  it('cannot read the coach\'s messages with the client or the coach\'s private notes', async () => {
    const { db, owner } = await setup();
    expect(await rows(db, owner, `select * from public.trainer_comments`)).toHaveLength(0);
    expect(await rows(db, owner, `select * from public.trainer_notes`)).toHaveLength(0);
  }, 60000);

  it('cannot change anything of the client\'s', async () => {
    const { db, owner, kai } = await setup();
    await as(db, owner, `update public.food_logs set calories = 1 where user_id = $1`, [kai]);
    await as(db, owner, `delete from public.food_logs where user_id = $1`, [kai]);
    await as(db, owner, `update public.profiles set calorie_target = 1 where id = $1`, [kai]);
    expect(Number((await db.query(`select calories from public.food_logs where user_id = $1`, [kai])).rows[0].calories)).toBe(300);
    expect((await db.query(`select calorie_target from public.profiles where id = $1`, [kai])).rows[0].calorie_target).toBeNull();
    await rejects(as(db, owner, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'x', 1)`, [kai]), /row-level security/);
    await rejects(as(db, owner, `insert into public.trainer_comments (trainer_id, client_id, body) values ($1, $2, 'hi')`, [owner, kai]), /row-level security/);
  }, 60000);

  it('does not see clients of someone who is not on their team', async () => {
    const { db, owner, zed } = await setup();
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [zed])).toHaveLength(0);
    expect(await rows(db, owner, `select * from public.profiles where id = $1`, [zed])).toHaveLength(0);
  }, 60000);
});

describe('who does NOT get this', () => {
  it('teammates who are not the owner cannot see each other\'s clients', async () => {
    const { db, mate2, kai } = await setup();
    expect(await rows(db, mate2, `select * from public.food_logs where user_id = $1`, [kai])).toHaveLength(0);
    expect(await rows(db, mate2, `select * from public.profiles where id = $1`, [kai])).toHaveLength(0);
  }, 60000);

  it('the owner of a different team cannot', async () => {
    const { db, otherOwner, kai } = await setup();
    expect(await rows(db, otherOwner, `select * from public.food_logs where user_id = $1`, [kai])).toHaveLength(0);
  }, 60000);

  it('nobody outside any team can', async () => {
    const { db, outsider, kai } = await setup();
    expect(await rows(db, outsider, `select * from public.food_logs where user_id = $1`, [kai])).toHaveLength(0);
  }, 60000);

  it('a client who has not accepted yet is not visible', async () => {
    const { db, owner, mate2, link } = await setup();
    const pending = await addUser(db, 'Pia Pending');
    await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'lunch', 'Toast', 90)`, [pending]);
    await link(mate2, pending, 'pending');
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [pending])).toHaveLength(0);
  }, 60000);
});

describe('access follows the team and the client', () => {
  it('ends when the client disconnects from that coach', async () => {
    const { db, owner, kai, mate } = await setup();
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1 and client_id = $2`, [mate, kai]);
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [kai])).toHaveLength(0);
  }, 60000);

  it('ends when the coach leaves the team', async () => {
    const { db, owner, mate, kai } = await setup();
    await as(db, mate, `select public.leave_coach_team()`);
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [kai])).toHaveLength(0);
  }, 60000);

  it('starts for a client a teammate gains later', async () => {
    const { db, owner, mate2, link } = await setup();
    const late = await addUser(db, 'Lia Late');
    await svc(db, `insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, current_date, 'dinner', 'Pasta', 500)`, [late]);
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [late])).toHaveLength(0);
    await link(mate2, late);
    expect(await rows(db, owner, `select * from public.food_logs where user_id = $1`, [late])).toHaveLength(1);
  }, 60000);
});

describe('the team client list', () => {
  const summaries = (db, uid, scope) => rows(db, uid, scope === undefined ? `select * from public.get_client_summaries(current_date)` : `select * from public.get_client_summaries(current_date, $1)`, scope === undefined ? [] : [scope]);

  it('team scope lists the other coaches\' clients, each with its coach', async () => {
    const { db, owner, mate, kai } = await setup();
    const r = await summaries(db, owner, 'team');
    expect(r.map((x) => x.client_name)).toEqual(['Kai Client']);
    expect(r[0]).toMatchObject({ client_id: kai, coach_id: mate, coach_name: 'Mia Mate' });
    expect(Number(r[0].today_cal)).toBe(300);
  }, 60000);

  it('the default and "mine" scopes are still only your own clients', async () => {
    const { db, owner, lou } = await setup();
    expect((await summaries(db, owner)).map((x) => x.client_id)).toEqual([lou]);
    expect((await summaries(db, owner, 'mine')).map((x) => x.client_id)).toEqual([lou]);
    expect((await summaries(db, owner, 'mine'))[0].coach_name).toBe('Olive Owner');
  }, 60000);

  it('only a team owner gets anything for the team scope', async () => {
    const { db, mate, mate2, outsider } = await setup();
    expect(await summaries(db, mate2, 'team')).toHaveLength(0);
    expect(await summaries(db, mate, 'team')).toHaveLength(0);
    expect(await summaries(db, outsider, 'team')).toHaveLength(0);
  }, 60000);

  it('the team\'s links are readable to the owner only', async () => {
    const { db, owner, mate2, kai } = await setup();
    expect((await rows(db, owner, `select client_id from public.trainer_clients where client_id = $1`, [kai])).length).toBe(1);
    expect(await rows(db, mate2, `select client_id from public.trainer_clients where client_id = $1`, [kai])).toHaveLength(0);
  }, 60000);
});

describe('telling the client', () => {
  it('get_my_coach_links names the team owner for a client of a team member', async () => {
    const { db, kai, lou, zed } = await setup();
    expect((await rows(db, kai, `select team_owner_name from public.get_my_coach_links()`))[0].team_owner_name).toBe('Olive Owner');
    expect((await rows(db, lou, `select team_owner_name from public.get_my_coach_links()`))[0].team_owner_name).toBeNull(); // Olive is the coach herself
    expect((await rows(db, zed, `select team_owner_name from public.get_my_coach_links()`))[0].team_owner_name).toBeNull(); // not on a team
  }, 60000);

  it('queues one email notice per owner and client when a coach joins with existing clients', async () => {
    const { db, owner, mate, kai } = await setup();
    const n = (await db.query(`select * from public.team_view_notices`)).rows;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ client_id: kai, owner_id: owner, trainer_id: mate, emailed_at: null });
  }, 60000);

  it('queues a notice when a team member gains a client, and none for the owner\'s own clients', async () => {
    const { db, mate2, link } = await setup();
    const late = await addUser(db, 'Lia Late');
    await link(mate2, late, 'pending');
    expect((await db.query(`select * from public.team_view_notices where client_id = $1`, [late])).rows).toHaveLength(0); // not active yet
    await svc(db, `update public.trainer_clients set status = 'active' where client_id = $1`, [late]);
    expect((await db.query(`select * from public.team_view_notices where client_id = $1`, [late])).rows).toHaveLength(1);
    expect((await db.query(`select * from public.team_view_notices`)).rows).toHaveLength(2); // Kai and Lia; not Lou (the owner's), not Zed (no team)
  }, 60000);

  it('never queues the same notice twice', async () => {
    const { db, mate, kai } = await setup();
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1 and client_id = $2`, [mate, kai]);
    await svc(db, `update public.trainer_clients set status = 'active' where trainer_id = $1 and client_id = $2`, [mate, kai]);
    expect((await db.query(`select * from public.team_view_notices where client_id = $1`, [kai])).rows).toHaveLength(1);
  }, 60000);

  it('the queue is not readable by anyone signed in', async () => {
    const { db, owner, kai } = await setup();
    expect(await rows(db, owner, `select * from public.team_view_notices`)).toHaveLength(0);
    expect(await rows(db, kai, `select * from public.team_view_notices`)).toHaveLength(0);
  }, 60000);
});
