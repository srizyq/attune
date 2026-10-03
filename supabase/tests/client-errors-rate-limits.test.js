import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, addUser, asUser, asService } from './harness.js';

beforeAll(() => createDb(), 60000);

describe('client_errors', () => {
  it('lets a signed-in user report an error as themselves', async () => {
    const db = await createDb();
    const id = await addUser(db, 'Alex');
    await asUser(db, id, (q) => q(`insert into public.client_errors (user_id, message, route) values ('${id}', 'boom', '/log')`));
    const { rows } = await db.query(`select message, user_id from public.client_errors`);
    expect(rows).toEqual([{ message: 'boom', user_id: id }]);
  });

  it('does not let one user file an error under another account', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Alex');
    const b = await addUser(db, 'Sam');
    await expect(asUser(db, a, (q) => q(`insert into public.client_errors (user_id, message) values ('${b}', 'spoof')`))).rejects.toThrow();
    expect((await db.query(`select 1 from public.client_errors`)).rows).toHaveLength(0);
  });

  it('cannot be read back through the API', async () => {
    const db = await createDb();
    const id = await addUser(db, 'Alex');
    await db.query(`insert into public.client_errors (message) values ('x')`);
    const res = await asUser(db, id, (q) => q(`select * from public.client_errors`));
    expect(res.rows).toHaveLength(0);
  });

  it('rejects an oversized message', async () => {
    const db = await createDb();
    await expect(db.query(`insert into public.client_errors (message) values ('${'x'.repeat(1001)}')`)).rejects.toThrow();
  });
});

describe('rate_limit_hit', () => {
  const hit = async (db, key, max = 3, secs = 60) => (await asService(db, (q) => q(`select public.rate_limit_hit('${key}', ${max}, ${secs}) as ok`))).rows[0].ok;

  it('allows up to the limit, then refuses', async () => {
    const db = await createDb();
    expect([await hit(db, 'k'), await hit(db, 'k'), await hit(db, 'k'), await hit(db, 'k')]).toEqual([true, true, true, false]);
  });

  it('counts keys separately', async () => {
    const db = await createDb();
    await hit(db, 'a', 1);
    expect(await hit(db, 'a', 1)).toBe(false);
    expect(await hit(db, 'b', 1)).toBe(true);
  });

  it('starts a fresh window once the old one has expired', async () => {
    const db = await createDb();
    await hit(db, 'k', 1);
    expect(await hit(db, 'k', 1)).toBe(false);
    await db.query(`update public.rate_limits set window_start = now() - interval '2 minutes'`);
    expect(await hit(db, 'k', 1)).toBe(true);
  });

  it('is not callable by a signed-in user', async () => {
    const db = await createDb();
    const id = await addUser(db, 'Alex');
    await expect(asUser(db, id, (q) => q(`select public.rate_limit_hit('k', 1, 60)`))).rejects.toThrow();
  });
});
