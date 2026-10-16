import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService } from './harness.js';
import { EXPORT_TABLES, EXPORT_EXCLUDED, EXPORT_COVERED_ELSEWHERE } from '../../src/lib/dataExportTables.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));

describe('the data export reads real tables', () => {
  it('every query the export runs works against the real schema, as the person themselves', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Sam');
    for (const def of EXPORT_TABLES) {
      const order = def.order.length ? ` order by ${def.order.join(', ')}` : '';
      // A wrong column name or a table the person can't read would otherwise just
      // be a section silently missing from someone's export.
      await expect(as(db, me, `select * from public.${def.table} where ${def.col} = $1${order}`, [me]), `${def.table}.${def.col}`).resolves.toBeTruthy();
    }
    await expect(as(db, me, `select * from public.friendships where user_a = $1 order by user_b`, [me])).resolves.toBeTruthy();
    await expect(as(db, me, `select * from public.friendships where user_b = $1 order by user_a`, [me])).resolves.toBeTruthy();
  }, 120000);

  it('returns a person\'s own coaching data, both directions of the conversation, and nothing of anyone else\'s', async () => {
    const db = await createDb();
    const coach = await addUser(db, 'Coach', { coachPass: true });
    const me = await addUser(db, 'Sam');
    const other = await addUser(db, 'Other');
    const svc = (sql, p) => asService(db, (q) => q(sql, p));
    await svc(`insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now()), ($1, $3, 'active', now())`, [coach, me, other]);
    await svc(`insert into public.trainer_comments (trainer_id, client_id, body, category, sender_role) values ($1, $2, 'from coach', 'general', 'trainer'), ($1, $2, 'my reply', 'general', 'client'), ($1, $3, 'someone else', 'general', 'trainer')`, [coach, me, other]);
    await svc(`insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'private note')`, [coach, me]);
    const def = (t) => EXPORT_TABLES.find((d) => d.table === t);
    const rows = async (t) => (await as(db, me, `select * from public.${t} where ${def(t).col} = $1`, [me])).rows;
    expect((await rows('trainer_comments')).map((r) => r.body).sort()).toEqual(['from coach', 'my reply']);
    expect((await rows('trainer_clients')).map((r) => r.client_id)).toEqual([me]);
    // and the coach's private notes are not something the person can read, so the export can't include them
    expect((await as(db, me, `select * from public.trainer_notes where client_id = $1`, [me])).rows).toEqual([]);
  }, 120000);
});

describe('no table that holds a person\'s data is forgotten', () => {
  it('every table that cascades from a user is exported, or excluded with a reason', async () => {
    const db = await createDb();
    const { rows } = await db.query(`
      select distinct c.conrelid::regclass::text as tbl
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confdeltype = 'c'
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)`);
    const known = new Set([...EXPORT_TABLES.map((d) => d.table), ...Object.keys(EXPORT_EXCLUDED), ...Object.keys(EXPORT_COVERED_ELSEWHERE)]);
    const forgotten = rows.map((r) => r.tbl.replace(/^public\./, '')).filter((t) => !known.has(t));
    expect(forgotten, `these tables hold user data but are neither exported nor excluded: ${forgotten.join(', ')} — add them to src/lib/dataExportTables.js`).toEqual([]);
  }, 120000);

  it('every exclusion is a real table, with a stated reason', async () => {
    const db = await createDb();
    const { rows } = await db.query(`select table_name from information_schema.tables where table_schema = 'public'`);
    const tables = new Set(rows.map((r) => r.table_name));
    for (const [t, why] of Object.entries(EXPORT_EXCLUDED)) {
      expect(tables.has(t), t).toBe(true);
      expect(why.length, t).toBeGreaterThan(10);
    }
    for (const d of EXPORT_TABLES) expect(tables.has(d.table), d.table).toBe(true);
  }, 120000);
});

describe('deleting an account', () => {
  it('leaves nothing behind and blocks nothing: every link to a user cascades or clears', async () => {
    const db = await createDb();
    const { rows } = await db.query(`
      select c.conrelid::regclass::text as tbl, a.attname as col,
             case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'd' then 'SET DEFAULT' end as rule
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
        and c.confdeltype not in ('c', 'n')`);
    // 'NO ACTION' would stop a delete (or leave an orphan); only CASCADE / SET NULL are fine.
    expect(rows.map((r) => `${r.tbl}.${r.col}: ${r.rule}`)).toEqual([]);
  }, 120000);

  it('removes a client\'s coaching data when they delete their account, and leaves the coach\'s other clients alone', async () => {
    const db = await createDb();
    const coach = await addUser(db, 'Coach', { coachPass: true });
    const me = await addUser(db, 'Sam');
    const other = await addUser(db, 'Other');
    const svc = (sql, p) => asService(db, (q) => q(sql, p));
    await svc(`insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now()), ($1, $3, 'active', now())`, [coach, me, other]);
    await svc(`insert into public.trainer_comments (trainer_id, client_id, body, category, sender_role) values ($1, $2, 'hi', 'general', 'trainer'), ($1, $3, 'hi other', 'general', 'trainer')`, [coach, me, other]);
    await svc(`insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'note about sam'), ($1, $3, 'note about other')`, [coach, me, other]);
    await svc(`insert into public.meal_plans (trainer_id, client_id, days) values ($1, $2, '{}'::jsonb)`, [coach, me]);
    await svc(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, '2026-10-01', 'lunch', 'x', 1)`, [me]);
    await svc(`update public.profiles set targets_set_by = $1 where id = $2`, [coach, me]);

    // Supabase's admin API deletes the auth user as the database owner, which is what this does.
    await db.query(`delete from auth.users where id = $1`, [me]);

    const count = async (sql, p) => Number((await svc(sql, p)).rows[0].n);
    expect(await count(`select count(*) n from public.profiles where id = $1`, [me])).toBe(0);
    expect(await count(`select count(*) n from public.trainer_clients where client_id = $1`, [me])).toBe(0);
    expect(await count(`select count(*) n from public.trainer_comments where client_id = $1`, [me])).toBe(0);
    expect(await count(`select count(*) n from public.trainer_notes where client_id = $1`, [me])).toBe(0);
    expect(await count(`select count(*) n from public.meal_plans where client_id = $1`, [me])).toBe(0);
    expect(await count(`select count(*) n from public.food_logs where user_id = $1`, [me])).toBe(0);
    // the coach and their other client are untouched
    expect(await count(`select count(*) n from public.trainer_notes where client_id = $1`, [other])).toBe(1);
    expect(await count(`select count(*) n from public.trainer_clients where client_id = $1`, [other])).toBe(1);
  }, 120000);

  it('when a coach deletes their account, their notes go, the client keeps their own data, and "set by" clears', async () => {
    const db = await createDb();
    const coach = await addUser(db, 'Coach', { coachPass: true });
    const me = await addUser(db, 'Sam');
    const svc = (sql, p) => asService(db, (q) => q(sql, p));
    await svc(`insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [coach, me]);
    await svc(`insert into public.trainer_notes (trainer_id, client_id, body) values ($1, $2, 'note')`, [coach, me]);
    await svc(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories) values ($1, '2026-10-01', 'lunch', 'x', 1)`, [me]);
    await svc(`update public.profiles set targets_set_by = $1, calorie_target = 2100 where id = $2`, [coach, me]);

    await db.query(`delete from auth.users where id = $1`, [coach]);

    const row = (await svc(`select targets_set_by, calorie_target from public.profiles where id = $1`, [me])).rows[0];
    expect(row).toEqual({ targets_set_by: null, calorie_target: 2100 }); // numbers stay, ownership clears
    expect(Number((await svc(`select count(*) n from public.food_logs where user_id = $1`, [me])).rows[0].n)).toBe(1);
    expect(Number((await svc(`select count(*) n from public.trainer_notes where client_id = $1`, [me])).rows[0].n)).toBe(0);
    expect(Number((await svc(`select count(*) n from public.trainer_clients where client_id = $1`, [me])).rows[0].n)).toBe(0);
  }, 120000);
});
