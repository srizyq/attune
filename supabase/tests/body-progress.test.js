import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client, stranger };
}
const measure = (db, uid, kind, value, unit, date = '2026-09-20') =>
  as(db, uid, `insert into public.body_measurements (user_id, logged_date, kind, value, unit) values ($1, $2, $3, $4, $5)`, [uid, date, kind, value, unit]);
const photoRow = (db, uid, path, date = '2026-09-20') =>
  as(db, uid, `insert into public.progress_photos (user_id, taken_date, path) values ($1, $2, $3)`, [uid, date, path]);
const putObject = (db, uid, name) => as(db, uid, `insert into storage.objects (bucket_id, name, owner) values ('progress-photos', $1, $2)`, [name, uid]);
const visibleObjects = async (db, uid) => (await as(db, uid, `select name from storage.objects where bucket_id = 'progress-photos' order by name`)).rows.map(r => r.name);

describe('body_measurements', () => {
  it('stores a valid measurement and rejects nonsense', async () => {
    const { db, client } = await setup();
    await measure(db, client, 'waist', 82.5, 'cm');
    await measure(db, client, 'body_fat', 18.2, 'pct');
    await expect(measure(db, client, 'waist', 82, 'pct', '2026-09-19')).rejects.toThrow(/check constraint/);     // length as a percentage
    await expect(measure(db, client, 'body_fat', 18, 'cm', '2026-09-19')).rejects.toThrow(/check constraint/);    // body fat as a length
    await expect(measure(db, client, 'body_fat', 90, 'pct', '2026-09-19')).rejects.toThrow(/check constraint/);   // impossible
    await expect(measure(db, client, 'waist', -3, 'cm', '2026-09-19')).rejects.toThrow(/check constraint/);
    await expect(measure(db, client, 'waist', 0, 'cm', '2026-09-19')).rejects.toThrow(/check constraint/);
    await expect(measure(db, client, 'neck', 40, 'cm', '2026-09-19')).rejects.toThrow(/check constraint/);
    await expect(measure(db, client, 'waist', 82, 'cm')).rejects.toThrow(/duplicate key/);                        // one per kind per day
  }, 60000);

  it('is private to its owner, except an active coach may read it', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await measure(db, client, 'waist', 82.5, 'cm');
    const count = async (uid) => (await as(db, uid, `select * from public.body_measurements`)).rows.length;
    expect(await count(client)).toBe(1);
    expect(await count(trainer)).toBe(1);
    expect(await count(other)).toBe(0);
    expect(await count(stranger)).toBe(0);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect(await count(trainer)).toBe(0);
    await svc(db, `update public.trainer_clients set status = 'pending' where trainer_id = $1`, [trainer]);
    expect(await count(trainer)).toBe(0);
  }, 60000);

  it('is never writable by a coach, or by anyone for someone else', async () => {
    const { db, trainer, client, stranger } = await setup();
    await expect(as(db, trainer, `insert into public.body_measurements (user_id, logged_date, kind, value, unit) values ($1, '2026-09-20', 'waist', 80, 'cm')`, [client])).rejects.toThrow(/row-level security/);
    await expect(as(db, stranger, `insert into public.body_measurements (user_id, logged_date, kind, value, unit) values ($1, '2026-09-20', 'waist', 80, 'cm')`, [client])).rejects.toThrow(/row-level security/);
    await measure(db, client, 'waist', 82.5, 'cm');
    await as(db, trainer, `update public.body_measurements set value = 1 where user_id = $1`, [client]);
    await as(db, trainer, `delete from public.body_measurements where user_id = $1`, [client]);
    expect((await svc(db, `select value from public.body_measurements`)).rows.map(r => Number(r.value))).toEqual([82.5]);
  }, 60000);

  it('lets the owner correct and remove their own entries', async () => {
    const { db, client } = await setup();
    await measure(db, client, 'waist', 82.5, 'cm');
    await as(db, client, `update public.body_measurements set value = 81 where user_id = $1`, [client]);
    expect((await svc(db, `select value from public.body_measurements`)).rows.map(r => Number(r.value))).toEqual([81]);
    await as(db, client, `delete from public.body_measurements where user_id = $1`, [client]);
    expect((await svc(db, `select * from public.body_measurements`)).rows).toHaveLength(0);
  }, 60000);
});

describe('progress_photos rows', () => {
  it('must point inside the owner\'s own folder', async () => {
    const { db, client, stranger } = await setup();
    await photoRow(db, client, `${client}/a.jpg`);
    await expect(photoRow(db, client, `${stranger}/steal.jpg`)).rejects.toThrow(/check constraint/);
    await expect(photoRow(db, client, `elsewhere/a.jpg`)).rejects.toThrow(/check constraint/);
    await expect(photoRow(db, client, `${client}/a.jpg`)).rejects.toThrow(/duplicate key/);
  }, 60000);

  it('is visible to the owner and their active coach only, and never writable by a coach', async () => {
    const { db, trainer, other, client } = await setup();
    await photoRow(db, client, `${client}/a.jpg`);
    const count = async (uid) => (await as(db, uid, `select * from public.progress_photos`)).rows.length;
    expect([await count(client), await count(trainer), await count(other)]).toEqual([1, 1, 0]);
    await expect(as(db, trainer, `insert into public.progress_photos (user_id, taken_date, path) values ($1, '2026-09-20', $2)`, [client, `${client}/b.jpg`])).rejects.toThrow(/row-level security/);
    await as(db, trainer, `delete from public.progress_photos where user_id = $1`, [client]);
    expect(await count(client)).toBe(1);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect(await count(trainer)).toBe(0);
  }, 60000);

  it('caps the note length', async () => {
    const { db, client } = await setup();
    await expect(as(db, client, `insert into public.progress_photos (user_id, taken_date, path, note) values ($1, '2026-09-20', $2, $3)`, [client, `${client}/a.jpg`, 'x'.repeat(201)])).rejects.toThrow(/check constraint/);
  }, 60000);
});

describe('progress-photos storage', () => {
  it('is a private, size-capped, image-only bucket', async () => {
    const { db } = await setup();
    const b = (await db.query(`select * from storage.buckets where id = 'progress-photos'`)).rows[0];
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(8388608);
    expect(b.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  }, 60000);

  it('lets a user upload only into their own folder', async () => {
    const { db, client, stranger } = await setup();
    await putObject(db, client, `${client}/a.jpg`);
    await expect(putObject(db, client, `${stranger}/a.jpg`)).rejects.toThrow(/row-level security/);
    await expect(putObject(db, stranger, `${client}/planted.jpg`)).rejects.toThrow(/row-level security/);
    await expect(putObject(db, client, `loose.jpg`)).rejects.toThrow(/row-level security/);
  }, 60000);

  it('shows an object to its owner and their active coach, and to nobody else', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await putObject(db, client, `${client}/a.jpg`);
    expect(await visibleObjects(db, client)).toEqual([`${client}/a.jpg`]);
    expect(await visibleObjects(db, trainer)).toEqual([`${client}/a.jpg`]);
    expect(await visibleObjects(db, other)).toEqual([]);
    expect(await visibleObjects(db, stranger)).toEqual([]);
  }, 60000);

  it('removes a coach\'s access the moment the link is not active', async () => {
    const { db, trainer, client } = await setup();
    await putObject(db, client, `${client}/a.jpg`);
    for (const status of ['revoked', 'pending']) {
      await svc(db, `update public.trainer_clients set status = $2 where trainer_id = $1`, [trainer, status]);
      expect(await visibleObjects(db, trainer), status).toEqual([]);
    }
    await svc(db, `update public.trainer_clients set status = 'active' where trainer_id = $1`, [trainer]);
    expect(await visibleObjects(db, trainer)).toHaveLength(1);
  }, 60000);

  it('never lets a coach delete or replace a client\'s photo', async () => {
    const { db, trainer, client } = await setup();
    await putObject(db, client, `${client}/a.jpg`);
    await as(db, trainer, `delete from storage.objects where bucket_id = 'progress-photos'`);
    await expect(putObject(db, trainer, `${client}/coach.jpg`)).rejects.toThrow(/row-level security/);
    expect(await visibleObjects(db, client)).toEqual([`${client}/a.jpg`]);
  }, 60000);

  it('lets the owner delete their own photo, but not someone else\'s', async () => {
    const { db, client, stranger } = await setup();
    await putObject(db, client, `${client}/a.jpg`);
    await as(db, stranger, `delete from storage.objects where bucket_id = 'progress-photos'`);
    expect(await visibleObjects(db, client)).toHaveLength(1);
    await as(db, client, `delete from storage.objects where bucket_id = 'progress-photos'`);
    expect(await visibleObjects(db, client)).toHaveLength(0);
  }, 60000);

  it('does not affect the other bucket\'s objects (the policies are scoped by bucket)', async () => {
    const { db, trainer, client } = await setup();
    await db.query(`insert into storage.objects (bucket_id, name) values ('coach-logos', $1)`, [`${client}/logo.png`]);
    // The coach-logos policy is public read; the point is that a progress-photos policy
    // doesn't leak a *different* bucket's row into progress-photos queries.
    expect(await visibleObjects(db, trainer)).toEqual([]);
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Body measurements and progress photos');
    expect(block).toContain('progress-photos');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
