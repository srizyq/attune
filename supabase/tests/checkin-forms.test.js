import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, asService, sliceMigration } from './harness.js';

const svc = (db, sql, params) => asService(db, (q) => q(sql, params));
const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const Q = [
  { id: 'sleep', type: 'scale', label: 'How was your sleep?' },
  { id: 'hungry', type: 'yesno', label: 'Were you often hungry?' },
  { id: 'wins', type: 'text', label: 'Any wins this week?' },
];
const GOOD = { sleep: 7, hungry: false, wins: 'Hit my protein every day' };

async function setup() {
  const db = await createDb();
  const trainer = await addUser(db, 'Trainer', { coachPass: true });
  const other = await addUser(db, 'Other Trainer', { coachPass: true });
  const client = await addUser(db, 'Sam Client');
  const stranger = await addUser(db, 'Stranger');
  await svc(db, `insert into public.trainer_clients (trainer_id, client_id, status, consented_at) values ($1, $2, 'active', now())`, [trainer, client]);
  return { db, trainer, other, client, stranger };
}
const makeForm = async (db, trainer, client, questions = Q, extra = '') =>
  (await as(db, trainer, `insert into public.checkin_forms (trainer_id, client_id, questions ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $3::jsonb ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [trainer, client, JSON.stringify(questions)])).rows[0].id;
const respond = (db, uid, formId, answers) => as(db, uid, `insert into public.checkin_responses (form_id, answers) values ($1, $2::jsonb)`, [formId, JSON.stringify(answers)]);
const valid = async (db, q) => (await db.query(`select public.valid_checkin_questions($1::jsonb) v`, [JSON.stringify(q)])).rows[0].v;
const validA = async (db, q, a) => (await db.query(`select public.valid_checkin_answers($1::jsonb, $2::jsonb) v`, [JSON.stringify(q), JSON.stringify(a)])).rows[0].v;

describe('valid_checkin_questions', () => {
  it('accepts a well-formed set and rejects each kind of malformed one', async () => {
    const db = await createDb();
    expect(await valid(db, Q)).toBe(true);
    expect(await valid(db, [])).toBe(false);
    expect(await valid(db, Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, type: 'text', label: 'x' })))).toBe(false);
    expect(await valid(db, Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, type: 'text', label: 'x' })))).toBe(true);
    expect(await valid(db, { id: 'a' })).toBe(false);
    expect(await valid(db, ['nope'])).toBe(false);
    expect(await valid(db, [{ id: 'a', type: 'scale' }])).toBe(false);                          // no label
    expect(await valid(db, [{ id: 'a', label: 'x' }])).toBe(false);                             // no type
    expect(await valid(db, [{ type: 'scale', label: 'x' }])).toBe(false);                       // no id
    expect(await valid(db, [{ id: 'a', type: 'essay', label: 'x' }])).toBe(false);              // unknown type
    expect(await valid(db, [{ id: 'A b', type: 'text', label: 'x' }])).toBe(false);             // bad id
    expect(await valid(db, [{ id: 'a', type: 'text', label: '' }])).toBe(false);
    expect(await valid(db, [{ id: 'a', type: 'text', label: 'x'.repeat(201) }])).toBe(false);
    expect(await valid(db, [{ id: 'a', type: 'text', label: 'x' }, { id: 'a', type: 'scale', label: 'y' }])).toBe(false); // dup id
    expect(await valid(db, [{ id: 5, type: 'text', label: 'x' }])).toBe(false);
  }, 60000);
});

describe('valid_checkin_answers', () => {
  it('needs every question answered with the right kind of value, and nothing extra', async () => {
    const db = await createDb();
    expect(await validA(db, Q, GOOD)).toBe(true);
    expect(await validA(db, Q, { ...GOOD, wins: '' })).toBe(true);                // empty text is fine
    expect(await validA(db, Q, { sleep: 7, hungry: false })).toBe(false);          // missing
    expect(await validA(db, Q, { ...GOOD, extra: 1 })).toBe(false);                // extra key
    expect(await validA(db, Q, { ...GOOD, sleep: 0 })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, sleep: 11 })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, sleep: 6.5 })).toBe(false);              // whole numbers only
    expect(await validA(db, Q, { ...GOOD, sleep: '7' })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, hungry: 'yes' })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, wins: 5 })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, wins: 'x'.repeat(2001) })).toBe(false);
    expect(await validA(db, Q, { ...GOOD, wins: 'x'.repeat(2000) })).toBe(true);
    expect(await validA(db, Q, [1, 2, 3])).toBe(false);
    expect(await validA(db, Q, { ...GOOD, sleep: null })).toBe(false);
  }, 60000);
});

describe('checkin_forms', () => {
  it('lets a trainer create a form for an active client, and only one per client', async () => {
    const { db, trainer, client } = await setup();
    await makeForm(db, trainer, client);
    await expect(makeForm(db, trainer, client)).rejects.toThrow(/duplicate key/);
  }, 60000);

  it('rejects bad questions, titles and cadences at the table', async () => {
    const { db, trainer, client } = await setup();
    await expect(makeForm(db, trainer, client, [{ id: 'a', type: 'nope', label: 'x' }])).rejects.toThrow(/check constraint/);
    await expect(makeForm(db, trainer, client, Q, 'cadence_days=0')).rejects.toThrow(/check constraint/);
    await expect(makeForm(db, trainer, client, Q, 'cadence_days=61')).rejects.toThrow(/check constraint/);
    await expect(makeForm(db, trainer, client, Q, `title=''`)).rejects.toThrow(/check constraint/);
  }, 60000);

  it('is refused for clients who are not active, or by someone else', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await expect(makeForm(db, trainer, stranger)).rejects.toThrow(/row-level security/);
    await expect(makeForm(db, other, client)).rejects.toThrow(/row-level security/);
    await svc(db, `update public.trainer_clients set status = 'pending' where trainer_id = $1`, [trainer]);
    await expect(makeForm(db, trainer, client)).rejects.toThrow(/row-level security/);
  }, 60000);

  it('is readable by its trainer and by the addressed client while linked — nobody else', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    await makeForm(db, trainer, client);
    const count = async (uid) => (await as(db, uid, `select * from public.checkin_forms`)).rows.length;
    expect([await count(trainer), await count(client), await count(other), await count(stranger)]).toEqual([1, 1, 0, 0]);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect(await count(client)).toBe(0); // disconnected: the form is gone from their side
    expect(await count(trainer)).toBe(1);
  }, 60000);

  it('cannot be edited or deleted by the client, and identity columns cannot be retargeted', async () => {
    const { db, trainer, client, stranger } = await setup();
    const id = await makeForm(db, trainer, client);
    await as(db, client, `update public.checkin_forms set title = 'hacked', is_active = false where id = $1`, [id]);
    await as(db, client, `delete from public.checkin_forms where id = $1`, [id]);
    await as(db, trainer, `update public.checkin_forms set client_id = $2, title = 'Renamed' where id = $1`, [id, stranger]);
    const row = (await svc(db, `select * from public.checkin_forms where id = $1`, [id])).rows[0];
    expect(row).toMatchObject({ title: 'Renamed', client_id: client, is_active: true });
  }, 60000);
});

describe('checkin_responses', () => {
  it('lets the client answer, filling in the coach and a snapshot of the questions', async () => {
    const { db, trainer, client } = await setup();
    const id = await makeForm(db, trainer, client);
    await respond(db, client, id, GOOD);
    const r = (await svc(db, `select * from public.checkin_responses`)).rows[0];
    expect(r).toMatchObject({ form_id: id, trainer_id: trainer, client_id: client });
    expect(r.questions_snapshot).toEqual(Q);
    expect(r.answers).toEqual(GOOD);
  }, 60000);

  it('keeps old answers meaningful after the form is edited', async () => {
    const { db, trainer, client } = await setup();
    const id = await makeForm(db, trainer, client);
    await respond(db, client, id, GOOD);
    await as(db, trainer, `update public.checkin_forms set questions = $2::jsonb where id = $1`, [id, JSON.stringify([{ id: 'mood', type: 'scale', label: 'Mood?' }])]);
    const r = (await svc(db, `select questions_snapshot from public.checkin_responses`)).rows[0];
    expect(r.questions_snapshot).toEqual(Q);
  }, 60000);

  it('rejects answers that do not match the form', async () => {
    const { db, trainer, client } = await setup();
    const id = await makeForm(db, trainer, client);
    await expect(respond(db, client, id, { sleep: 7 })).rejects.toThrow('missing or invalid');
    await expect(respond(db, client, id, { ...GOOD, sleep: 99 })).rejects.toThrow('missing or invalid');
    expect((await svc(db, `select * from public.checkin_responses`)).rows).toHaveLength(0);
  }, 60000);

  it('ignores a client-supplied trainer, client or snapshot', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    const id = await makeForm(db, trainer, client);
    await as(db, client, `insert into public.checkin_responses (form_id, trainer_id, client_id, questions_snapshot, answers) values ($1, $2, $3, '[]'::jsonb, $4::jsonb)`, [id, other, stranger, JSON.stringify(GOOD)]);
    const r = (await svc(db, `select * from public.checkin_responses`)).rows[0];
    expect(r).toMatchObject({ trainer_id: trainer, client_id: client });
    expect(r.questions_snapshot).toEqual(Q);
  }, 60000);

  it('can only be filed by the addressed client, for an active form', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    const id = await makeForm(db, trainer, client);
    await expect(respond(db, stranger, id, GOOD)).rejects.toThrow('Check-in form not found');
    await expect(respond(db, other, id, GOOD)).rejects.toThrow('Check-in form not found');
    await expect(respond(db, trainer, id, GOOD)).rejects.toThrow('Check-in form not found');
    await as(db, trainer, `update public.checkin_forms set is_active = false where id = $1`, [id]);
    await expect(respond(db, client, id, GOOD)).rejects.toThrow('Check-in form not found');
  }, 60000);

  it('is refused once the client has disconnected from that coach', async () => {
    const { db, trainer, client } = await setup();
    const id = await makeForm(db, trainer, client);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    await expect(respond(db, client, id, GOOD)).rejects.toThrow();
  }, 60000);

  it('throttles repeat submissions (12 hours), then allows the next one', async () => {
    const { db, trainer, client } = await setup();
    const id = await makeForm(db, trainer, client);
    await respond(db, client, id, GOOD);
    await expect(respond(db, client, id, GOOD)).rejects.toThrow('already submitted');
    await svc(db, `update public.checkin_responses set created_at = now() - interval '13 hours'`);
    await respond(db, client, id, GOOD);
    expect((await svc(db, `select * from public.checkin_responses`)).rows).toHaveLength(2);
  }, 60000);

  it('is readable by the client and their active coach, not others; and is a permanent record', async () => {
    const { db, trainer, other, client, stranger } = await setup();
    const id = await makeForm(db, trainer, client);
    await respond(db, client, id, GOOD);
    const count = async (uid) => (await as(db, uid, `select * from public.checkin_responses`)).rows.length;
    expect([await count(client), await count(trainer), await count(other), await count(stranger)]).toEqual([1, 1, 0, 0]);
    await as(db, client, `update public.checkin_responses set answers = '{}'::jsonb`);
    await as(db, client, `delete from public.checkin_responses`);
    await as(db, trainer, `delete from public.checkin_responses`);
    expect(await count(client)).toBe(1);
    expect((await svc(db, `select answers from public.checkin_responses`)).rows[0].answers).toEqual(GOOD);
    await svc(db, `update public.trainer_clients set status = 'revoked' where trainer_id = $1`, [trainer]);
    expect(await count(trainer)).toBe(0); // coach loses access on disconnect
  }, 60000);
});

describe('migration hygiene', () => {
  it('re-runs cleanly', async () => {
    const db = await createDb();
    const block = sliceMigration('Weekly check-in forms');
    expect(block).toContain('checkin_responses');
    await db.exec(block);
    await db.exec(block);
  }, 60000);
});
