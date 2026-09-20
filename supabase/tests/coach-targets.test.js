import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';
import { MICRO_NUTRIENTS } from '../../src/lib/microNutrients.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client };
}
const set = (db, who, client, targets) => as(db, who, `select public.set_client_micro_targets($1, $2::jsonb)`, [client, JSON.stringify(targets)]);
const stored = async (db, client) => (await svc(db, `select micro_targets from public.profiles where id = $1`, [client])).rows[0].micro_targets;

describe('micro_nutrient_keys stays in sync with the app', () => {
  it('lists exactly the nutrients in src/lib/microNutrients.js', async () => {
    const db = await createDb();
    const { rows } = await db.query(`select unnest(public.micro_nutrient_keys()) as k`);
    expect(rows.map(r => r.k).sort()).toEqual(MICRO_NUTRIENTS.map(n => n.key).sort());
  }, 60000);
});

describe('set_client_micro_targets', () => {
  it('lets a trainer set targets for an active client', async () => {
    const { db, trainer, client } = await setup();
    await set(db, trainer, client, { fibre: 30, sodium: 2000, vitaminD: 12.5 });
    expect(await stored(db, client)).toEqual({ fibre: 30, sodium: 2000, vitaminD: 12.5 });
  }, 60000);

  it('replaces the whole map, so clearing a nutrient really clears it', async () => {
    const { db, trainer, client } = await setup();
    await set(db, trainer, client, { fibre: 30, iron: 18 });
    await set(db, trainer, client, { iron: 18 });
    expect(await stored(db, client)).toEqual({ iron: 18 });
    await set(db, trainer, client, {});
    expect(await stored(db, client)).toEqual({});
  }, 60000);

  it('drops null entries instead of storing them', async () => {
    const { db, trainer, client } = await setup();
    await set(db, trainer, client, { fibre: 30, sodium: null });
    expect(await stored(db, client)).toEqual({ fibre: 30 });
  }, 60000);

  it('rejects unknown nutrients, non-numbers, negatives, absurd values and non-objects', async () => {
    const { db, trainer, client } = await setup();
    await expect(set(db, trainer, client, { bogus: 5 })).rejects.toThrow('Unknown nutrient: bogus');
    await expect(set(db, trainer, client, { fibre: '30' })).rejects.toThrow('must be a number');
    await expect(set(db, trainer, client, { fibre: -1 })).rejects.toThrow('out of range');
    await expect(set(db, trainer, client, { sodium: 1e9 })).rejects.toThrow('out of range');
    await expect(as(db, trainer, `select public.set_client_micro_targets($1, '[1,2]'::jsonb)`, [client])).rejects.toThrow('must be an object');
    await expect(as(db, trainer, `select public.set_client_micro_targets($1, null)`, [client])).rejects.toThrow('must be an object');
    expect(await stored(db, client)).toEqual({}); // nothing partial was written
  }, 60000);

  it('accepts zero (a legitimate target, e.g. trans fat)', async () => {
    const { db, trainer, client } = await setup();
    await set(db, trainer, client, { transFat: 0 });
    expect(await stored(db, client)).toEqual({ transFat: 0 });
  }, 60000);

  it('is refused for a trainer who is not linked to the client, or whose link is not active', async () => {
    const { db, trainer, other, client } = await setup();
    await expect(set(db, other, client, { fibre: 30 })).rejects.toThrow('Not an active trainer');
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    await expect(set(db, trainer, client, { fibre: 30 })).rejects.toThrow('Not an active trainer');
    await svc(db, `update public.trainer_clients set status = 'pending' where trainer_id = $1`, [trainer]);
    await expect(set(db, trainer, client, { fibre: 30 })).rejects.toThrow('Not an active trainer');
  }, 60000);

  it('cannot be called by a client on themselves via this route (they use their own settings)', async () => {
    const { db, client } = await setup();
    await expect(set(db, client, client, { fibre: 30 })).rejects.toThrow('Not an active trainer');
  }, 60000);

  it('is closed to signed-out callers', async () => {
    const { db, client } = await setup();
    await db.exec(`set role anon`);
    try {
      await expect(db.query(`select public.set_client_micro_targets($1, '{}'::jsonb)`, [client])).rejects.toThrow(/permission denied/);
    } finally { await db.exec(`reset role`); }
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Trainer-set nutrient targets');
    expect(block).toContain('set_client_micro_targets');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
