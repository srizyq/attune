import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

const submit = (db, uid, over = {}) => {
  const f = { message: 'The scan button does nothing', contactOk: true, screen: '/food', version: 'abc1234', ua: 'Safari iPhone', viewport: '390x844', errors: ['TypeError: x is undefined'], shot: null, ...over };
  return as(db, uid, `select public.submit_app_report($1,$2,$3,$4,$5,$6,$7::jsonb,$8) as id`, [f.message, f.contactOk, f.screen, f.version, f.ua, f.viewport, JSON.stringify(f.errors), f.shot]);
};
const admin = async (db, name) => {
  const id = await addUser(db, name);
  await db.query(`insert into public.app_admins (user_id) values ($1)`, [id]);
  return id;
};

describe('submitting a report', () => {
  it('stores the message with the details and the person\'s email', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const { rows } = await submit(db, a);
    const r = (await db.query(`select * from public.app_reports where id = $1`, [rows[0].id])).rows[0];
    expect(r).toMatchObject({ user_id: a, message: 'The scan button does nothing', screen: '/food', app_version: 'abc1234', viewport: '390x844', status: 'new', contact_email: 'ann@example.test' });
    expect(r.errors).toEqual(['TypeError: x is undefined']);
  }, 60000);

  it('leaves the email out when the person asks not to be contacted', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const { rows } = await submit(db, a, { contactOk: false });
    expect((await db.query(`select contact_email from public.app_reports where id = $1`, [rows[0].id])).rows[0].contact_email).toBeNull();
  }, 60000);

  it('rejects empty, tiny and huge messages', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await rejects(submit(db, a, { message: '   ' }), /report_invalid/);
    await rejects(submit(db, a, { message: 'bug' }), /report_invalid/);
    await rejects(submit(db, a, { message: 'x'.repeat(2001) }), /report_invalid/);
  }, 60000);

  it('keeps at most 10 errors, each cut to 300 characters, and ignores junk', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const many = Array.from({ length: 14 }, (_, i) => `error ${i} ${'y'.repeat(400)}`);
    const { rows } = await submit(db, a, { errors: many });
    const r = (await db.query(`select errors from public.app_reports where id = $1`, [rows[0].id])).rows[0];
    expect(r.errors).toHaveLength(10);
    expect(r.errors.every((e) => e.length <= 300)).toBe(true);
    const bad = await submit(db, a, { errors: 'not a list' });
    expect((await db.query(`select errors from public.app_reports where id = $1`, [bad.rows[0].id])).rows[0].errors).toEqual([]);
  }, 60000);

  it('is limited to three a day', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await submit(db, a); await submit(db, a); await submit(db, a);
    await rejects(submit(db, a), /report_rate_limited/);
    const b = await addUser(db, 'Bo');
    await submit(db, b); // someone else is unaffected
  }, 60000);

  it('only accepts a screenshot from the person\'s own folder', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await rejects(submit(db, a, { shot: `${b}/x.jpg` }), /report_invalid/);
    const { rows } = await submit(db, a, { shot: `${a}/x.jpg` });
    expect((await db.query(`select screenshot_path from public.app_reports where id = $1`, [rows[0].id])).rows[0].screenshot_path).toBe(`${a}/x.jpg`);
  }, 60000);

  it('needs a signed-in user and cannot be done by writing the table directly', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await rejects(db.query(`select public.submit_app_report('hello there','t','/','v','ua','1x1','[]'::jsonb,null)`), /permission denied|Not signed in/);
    await rejects(as(db, a, `insert into public.app_reports (user_id, message) values ($1, 'sneaky insert')`, [a]), /row-level security/);
  }, 60000);
});

describe('who can read and change reports', () => {
  it('people see only their own; admins see all', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo'); const boss = await admin(db, 'Boss');
    await submit(db, a); await submit(db, b, { message: 'Another problem here' });
    expect((await as(db, a, `select * from public.app_reports`)).rows).toHaveLength(1);
    expect((await as(db, b, `select * from public.app_reports`)).rows).toHaveLength(1);
    expect((await as(db, boss, `select * from public.app_reports`)).rows).toHaveLength(2);
    expect((await as(db, a, `select public.is_app_admin() as v`)).rows[0].v).toBe(false);
    expect((await as(db, boss, `select public.is_app_admin() as v`)).rows[0].v).toBe(true);
  }, 60000);

  it('only admins can change a report\'s status or note', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const boss = await admin(db, 'Boss');
    const { rows } = await submit(db, a);
    const id = rows[0].id;
    await as(db, a, `update public.app_reports set status = 'fixed' where id = $1`, [id]);
    expect((await db.query(`select status from public.app_reports where id = $1`, [id])).rows[0].status).toBe('new'); // RLS: no rows updated
    await as(db, boss, `update public.app_reports set status = 'pr_open', admin_note = 'on it' where id = $1`, [id]);
    expect((await db.query(`select status, admin_note from public.app_reports where id = $1`, [id])).rows[0]).toMatchObject({ status: 'pr_open', admin_note: 'on it' });
    await rejects(as(db, boss, `update public.app_reports set status = 'nonsense' where id = $1`, [id]), /check constraint|violates/);
  }, 60000);

  it('the admin list is not readable by anyone else', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); await admin(db, 'Boss');
    expect((await as(db, a, `select * from public.app_admins`)).rows).toHaveLength(0);
  }, 60000);

  it('deleting an account keeps the report but not the link to the person', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    const { rows } = await submit(db, a);
    await db.query(`delete from auth.users where id = $1`, [a]);
    expect((await db.query(`select user_id from public.app_reports where id = $1`, [rows[0].id])).rows[0].user_id).toBeNull();
  }, 60000);
});

describe('screenshot storage', () => {
  const put = (db, uid, name) => as(db, uid, `insert into storage.objects (bucket_id, name, owner) values ('report-screenshots', $1, $2)`, [name, uid]);

  it('lets a person upload into their own folder only', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await put(db, a, `${a}/shot.jpg`);
    await rejects(put(db, a, `${b}/shot.jpg`), /row-level security/);
  }, 60000);

  it('only admins can read screenshots, not even the uploader', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const boss = await admin(db, 'Boss');
    await put(db, a, `${a}/shot.jpg`);
    expect((await as(db, a, `select * from storage.objects where bucket_id = 'report-screenshots'`)).rows).toHaveLength(0);
    expect((await as(db, boss, `select * from storage.objects where bucket_id = 'report-screenshots'`)).rows).toHaveLength(1);
  }, 60000);

  it('is a private, size-limited, images-only bucket', async () => {
    const db = await createDb();
    const b = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'report-screenshots'`)).rows[0];
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(5242880);
    expect(b.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  }, 60000);
});
