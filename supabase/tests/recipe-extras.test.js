import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };
const svc = (db, sql, params) => asService(db, (q) => q(sql, params));

async function code(db, uid) { return (await as(db, uid, `select * from public.friends_me()`)).rows[0].invite_code; }
async function befriend(db, a, b) { await as(db, b, `select public.friends_add($1)`, [await code(db, a)]); }
const recipe = (db, uid, extra = '', params = []) =>
  as(db, uid, `insert into public.saved_meals (user_id, name, items${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, 'Pudding', '[]'::jsonb${extra ? ', ' + extra.split('=')[1] : ''}) returning *`, [uid, ...params]);
const put = (db, uid, name) => as(db, uid, `insert into storage.objects (bucket_id, name, owner) values ('recipe-photos', $1, $2)`, [name, uid]);
const visible = async (db, uid) => (await as(db, uid, `select name from storage.objects where bucket_id = 'recipe-photos' order by name`)).rows.map((r) => r.name);

describe('recipe tags, prep time and favourite', () => {
  it('start empty, so an old recipe looks the same as before', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const r = (await recipe(db, a)).rows[0];
    expect(r.tags).toEqual([]);
    expect(r.prep_minutes).toBeNull();
    expect(r.photo_path).toBeNull();
    expect(r.favourite).toBe(false);
  }, 60000);

  it('accept a few tags of the right length and reject too many or odd ones', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const ok = await recipe(db, a, `tags=$2`, [['Dessert', 'Pre-workout', 'High protein']]);
    expect(ok.rows[0].tags).toEqual(['Dessert', 'Pre-workout', 'High protein']);
    await rejects(recipe(db, a, `tags=$2`, [['1', '2', '3', '4', '5', '6', '7', '8', '9']]), /check constraint/);   // nine
    await rejects(recipe(db, a, `tags=$2`, [['x'.repeat(25)]]), /check constraint/);                                // too long
    await rejects(recipe(db, a, `tags=$2`, [['   ']]), /check constraint/);                                         // blank
    await rejects(recipe(db, a, `tags=$2`, [['']]), /check constraint/);
    expect((await recipe(db, a, `tags=$2`, [['x'.repeat(24)]])).rows).toHaveLength(1);                              // exactly 24 is fine
  }, 60000);

  it('keep prep time between 0 minutes and a day', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    expect((await recipe(db, a, `prep_minutes=$2`, [10])).rows[0].prep_minutes).toBe(10);
    expect((await recipe(db, a, `prep_minutes=$2`, [1440])).rows).toHaveLength(1);
    await rejects(recipe(db, a, `prep_minutes=$2`, [-1]), /check constraint/);
    await rejects(recipe(db, a, `prep_minutes=$2`, [1441]), /check constraint/);
  }, 60000);

  it('only let a recipe point at a photo in its owner\'s own folder', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    expect((await recipe(db, a, `photo_path=$2`, [`${a}/pudding.jpg`])).rows[0].photo_path).toBe(`${a}/pudding.jpg`);
    await rejects(recipe(db, a, `photo_path=$2`, [`${b}/pudding.jpg`]), /check constraint/);
    await rejects(recipe(db, a, `photo_path=$2`, ['pudding.jpg']), /check constraint/);
  }, 60000);
});

describe('the recipe-photos bucket', () => {
  it('is private, small and images only', async () => {
    const db = await createDb();
    const b = (await db.query(`select * from storage.buckets where id = 'recipe-photos'`)).rows[0];
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(4194304);
    expect(b.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  }, 60000);

  it('lets you add, see and delete your own photos, and nobody else\'s', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await put(db, a, `${a}/one.jpg`);
    expect(await visible(db, a)).toEqual([`${a}/one.jpg`]);
    expect(await visible(db, b)).toEqual([]);
    await rejects(put(db, b, `${a}/two.jpg`), /row-level security/);              // into someone else's folder
    await as(db, b, `delete from storage.objects where bucket_id = 'recipe-photos'`);
    expect(await visible(db, a)).toHaveLength(1);                                // b's delete touched nothing
    await as(db, a, `delete from storage.objects where bucket_id = 'recipe-photos'`);
    expect(await visible(db, a)).toEqual([]);
  }, 60000);

  it('shows a photo to a friend only while its recipe is shared with them', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo'); const c = await addUser(db, 'Cy');
    await befriend(db, a, b);
    const path = `${a}/pudding.jpg`;
    await put(db, a, path);
    const { rows: [r] } = await recipe(db, a, `photo_path=$2`, [path]);
    expect(await visible(db, b)).toEqual([]);                                     // not shared yet
    await as(db, a, `update public.saved_meals set shared_with_friends = true where id = $1`, [r.id]);
    expect(await visible(db, b)).toEqual([path]);                                 // shared with a friend
    expect(await visible(db, c)).toEqual([]);                                     // a stranger still can't
    await as(db, a, `update public.saved_meals set shared_with_friends = false where id = $1`, [r.id]);
    expect(await visible(db, b)).toEqual([]);                                     // unshared again
    await as(db, a, `update public.saved_meals set shared_with_friends = true where id = $1`, [r.id]);
    await as(db, b, `select public.friends_remove($1)`, [a]);
    expect(await visible(db, b)).toEqual([]);                                     // no longer friends
  }, 60000);
});

describe('friends_recipes', () => {
  it('now carries the photo, prep time and tags of shared recipes only', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await befriend(db, a, b);
    await as(db, a, `insert into public.saved_meals (user_id, name, items, shared_with_friends, photo_path, prep_minutes, tags) values ($1, 'Pudding', '[]'::jsonb, true, $2, 10, $3)`, [a, `${a}/p.jpg`, ['Dessert']]);
    await as(db, a, `insert into public.saved_meals (user_id, name, items, photo_path) values ($1, 'Secret', '[]'::jsonb, $2)`, [a, `${a}/s.jpg`]);
    const rows = (await as(db, b, `select * from public.friends_recipes($1)`, [a])).rows;
    expect(rows.map((r) => r.name)).toEqual(['Pudding']);
    expect(rows[0]).toMatchObject({ photo_path: `${a}/p.jpg`, prep_minutes: 10, tags: ['Dessert'] });
  }, 60000);
});

describe('re-running the update', () => {
  it('is safe on a database that already has it', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await recipe(db, a, `tags=$2`, [['Dessert']]);
    await db.exec(sliceMigration('Recipe photos, tags and prep time'));
    await db.exec(sliceMigration('Recipe photos, tags and prep time'));
    expect((await svc(db, `select tags from public.saved_meals`)).rows[0].tags).toEqual(['Dessert']);
  }, 60000);
});
