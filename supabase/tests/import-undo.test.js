import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));

// The same predicates src/lib/db.js sends (deleteImportedFood / deleteImportedWeights),
// run against the real schema and its row-level security.
const FROM = '2026-10-05T04:00:00Z';
const TO = '2026-10-05T04:00:30Z';
const food = (db, uid, name, source, createdAt, date = '2026-03-01') =>
  db.query(`insert into public.food_logs (user_id, logged_date, meal, food_name, calories, source, created_at) values ($1, $2, 'lunch', $3, 100, $4, $5)`, [uid, date, name, source, createdAt]);
const weight = (db, uid, date, createdAt) =>
  db.query(`insert into public.weight_logs (user_id, logged_date, weight, unit, created_at) values ($1, $2, 80, 'kg', $3)`, [uid, date, createdAt]);
const undoFood = (db, uid) => as(db, uid, `delete from public.food_logs where user_id = $1 and source = 'import' and created_at >= $2 and created_at <= $3 returning food_name`, [uid, FROM, TO]);
const undoWeights = (db, uid, dates) => as(db, uid, `delete from public.weight_logs where user_id = $1 and logged_date = any($2::date[]) and created_at >= $3 and created_at <= $4 returning logged_date::text d`, [uid, dates, FROM, TO]);
const names = async (db, uid) => (await db.query(`select food_name from public.food_logs where user_id = $1 order by food_name`, [uid])).rows.map((r) => r.food_name);

describe('undoing an import, against the real schema', () => {
  it('removes imported rows from the window and nothing else', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Switcher');
    await food(db, me, 'imported-in-window', 'import', '2026-10-05T04:00:10Z');
    await food(db, me, 'imported-edge', 'import', '2026-10-05T04:00:30Z');
    await food(db, me, 'imported-earlier', 'import', '2026-10-01T04:00:10Z'); // an older import
    await food(db, me, 'imported-later', 'import', '2026-10-06T04:00:10Z'); // a newer import
    await food(db, me, 'logged-by-hand', 'local', '2026-10-05T04:00:10Z'); // same minute, not imported
    await food(db, me, 'scanned', 'ai-estimate', '2026-10-05T04:00:12Z');
    const removed = await undoFood(db, me);
    expect(removed.rows.map((r) => r.food_name).sort()).toEqual(['imported-edge', 'imported-in-window']);
    expect(await names(db, me)).toEqual(['imported-earlier', 'imported-later', 'logged-by-hand', 'scanned']);
  });

  it('an entry edited after import is still removed (it keeps its imported mark)', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Switcher');
    await food(db, me, 'oats', 'import', '2026-10-05T04:00:10Z');
    await as(db, me, `update public.food_logs set food_name = 'oats (edited)', calories = 250 where user_id = $1`, [me]);
    expect((await undoFood(db, me)).rows).toHaveLength(1);
  });

  it('a copy made from an imported entry survives (a copy gets a new created_at)', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Switcher');
    await food(db, me, 'oats', 'import', '2026-10-05T04:00:10Z');
    await food(db, me, 'oats', 'import', '2026-10-09T09:00:00Z', '2026-03-02'); // "copy yesterday" later on
    expect((await undoFood(db, me)).rows).toHaveLength(1);
    expect(await names(db, me)).toEqual(['oats']);
  });

  it('never touches another person\'s imported rows, even in the same window', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Alice');
    const b = await addUser(db, 'Bob');
    await food(db, a, 'alice-import', 'import', '2026-10-05T04:00:10Z');
    await food(db, b, 'bob-import', 'import', '2026-10-05T04:00:10Z');
    expect((await undoFood(db, a)).rows.map((r) => r.food_name)).toEqual(['alice-import']);
    expect(await names(db, b)).toEqual(['bob-import']);
    // and even asking to delete Bob's rows as Alice removes nothing
    const sneaky = await as(db, a, `delete from public.food_logs where user_id = $1 and source = 'import' returning food_name`, [b]);
    expect(sneaky.rows).toHaveLength(0);
  });

  it('removes only the weigh-ins the import wrote: right dates AND inside the window', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Switcher');
    await weight(db, me, '2026-03-01', '2026-10-05T04:00:20Z'); // imported
    await weight(db, me, '2026-03-02', '2026-10-05T04:00:20Z'); // imported
    await weight(db, me, '2026-03-03', '2026-10-05T04:00:21Z'); // typed by hand in the same minute, different date
    await weight(db, me, '2026-03-04', '2026-02-01T00:00:00Z'); // existing before the import
    const removed = await undoWeights(db, me, ['2026-03-01', '2026-03-02', '2026-03-04']);
    expect(removed.rows.map((r) => r.d).sort()).toEqual(['2026-03-01', '2026-03-02']);
    const left = (await db.query(`select logged_date::text d from public.weight_logs where user_id = $1 order by 1`, [me])).rows.map((r) => r.d);
    expect(left).toEqual(['2026-03-03', '2026-03-04']);
  });

  it('a weigh-in that already existed on an imported date is not overwritten by the import, so undo leaves it', async () => {
    const db = await createDb();
    const me = await addUser(db, 'Switcher');
    await weight(db, me, '2026-03-01', '2026-02-01T00:00:00Z'); // there first
    // import tries the same date: ignoreDuplicates = on conflict do nothing
    await db.query(`insert into public.weight_logs (user_id, logged_date, weight, unit, created_at) values ($1, '2026-03-01', 99, 'kg', '2026-10-05T04:00:20Z') on conflict (user_id, logged_date) do nothing`, [me]);
    expect((await undoWeights(db, me, ['2026-03-01'])).rows).toHaveLength(0);
    expect(Number((await db.query(`select weight from public.weight_logs where user_id = $1`, [me])).rows[0].weight)).toBe(80);
  });
});
