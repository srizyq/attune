import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, addUser, asUser, asService } from './harness.js';

beforeAll(() => createDb(), 60000);

const AUTH_COLUMNS = `alter table auth.users add column if not exists created_at timestamptz not null default now(), add column if not exists email_change text not null default ''`;

async function setup() {
  const db = await createDb({ extraSql: [AUTH_COLUMNS] });
  const id = await addUser(db, 'Alex');
  return { db, id };
}

describe('app_settings.payments_frozen', () => {
  it('starts as a single row with payments_frozen false', async () => {
    const { db } = await setup();
    const { rows } = await db.query(`select id, payments_frozen from public.app_settings`);
    expect(rows).toEqual([{ id: true, payments_frozen: false }]);
  });

  it('is readable by a signed-out/anon connection', async () => {
    const { db } = await setup();
    await db.exec(`set role anon`);
    const { rows } = await db.query(`select payments_frozen from public.app_settings`);
    await db.exec(`reset role`);
    expect(rows).toEqual([{ payments_frozen: false }]);
  });

  it('cannot be flipped by an ordinary signed-in user', async () => {
    const { db, id } = await setup();
    await asUser(db, id, (q) => q(`update public.app_settings set payments_frozen = true where id = true`));
    const { rows } = await db.query(`select payments_frozen from public.app_settings`);
    expect(rows[0].payments_frozen).toBe(false);
  });

  it('can be flipped by the service role (how the SQL editor / pause-all-billing.mjs does it)', async () => {
    const { db } = await setup();
    await asService(db, (q) => q(`update public.app_settings set payments_frozen = true where id = true`));
    const { rows } = await db.query(`select payments_frozen from public.app_settings`);
    expect(rows[0].payments_frozen).toBe(true);
  });

  it('blocks start_free_trial() while frozen, with a clear message, and touches nothing', async () => {
    const { db, id } = await setup();
    await asService(db, (q) => q(`update public.app_settings set payments_frozen = true where id = true`));
    await expect(asUser(db, id, (q) => q(`select public.start_free_trial()`))).rejects.toThrow(/paused/);
    const { rows } = await db.query(`select trial_ends_at from public.profiles where id = $1`, [id]);
    expect(rows[0].trial_ends_at).toBeNull();
  });

  it('start_free_trial() works normally again once unfrozen', async () => {
    const { db, id } = await setup();
    await asService(db, (q) => q(`update public.app_settings set payments_frozen = true where id = true`));
    await asService(db, (q) => q(`update public.app_settings set payments_frozen = false where id = true`));
    const { rows } = await asUser(db, id, (q) => q(`select public.start_free_trial() as ends`));
    expect(rows[0].ends).not.toBeNull();
  });
});
