import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from './harness.js';

const as = (db, uid, sql, params) => asUser(db, uid, (q) => q(sql, params));
const rejects = async (p, re) => { await expect(p).rejects.toThrow(re); };

const fix = (db, uid, over = {}) => {
  const f = { barcode: '9300000000017', name: 'Choc bar', brand: 'Acme', serving: '1 bar (40g)', grams: 40, unit: 'g', cal: 180, protein: 12, carbs: 16, fat: 7, fibre: 2, sodium: 120, sugar: 5, ...over };
  return as(db, uid, `select public.barcode_correct($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [f.barcode, f.name, f.brand, f.serving, f.grams, f.unit, f.cal, f.protein, f.carbs, f.fat, f.fibre, f.sodium, f.sugar]);
};
const product = async (db, barcode = '9300000000017') => (await db.query(`select * from public.barcode_products where barcode = $1`, [barcode])).rows[0];

describe('correcting a barcode product', () => {
  it('creates the shared product for a barcode nobody had stored, marked as corrected', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await fix(db, a);
    const p = await product(db);
    expect(p).toMatchObject({ name: 'Choc bar', brand: 'Acme', serving: '1 bar (40g)', serving_unit: 'g' });
    expect(Number(p.calories)).toBe(180);
    expect(Number(p.protein_g)).toBe(12);
    expect(p.corrected_at).not.toBeNull();
    expect(p.corrected_by).toBe(a);
  }, 60000);

  it('updates an existing product for everyone, and anyone signed in can read the fix', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await as(db, a, `insert into public.barcode_products (barcode, name, calories, created_by) values ('9300000000017', 'Choc bar', 900, $1)`, [a]);
    await fix(db, b, { cal: 215, protein: 9 });
    const seen = (await as(db, a, `select * from public.barcode_products where barcode = '9300000000017'`)).rows[0];
    expect(Number(seen.calories)).toBe(215);
    expect(Number(seen.protein_g)).toBe(9);
    expect(seen.created_by).toBe(a); // the original contributor stays
    expect(seen.corrected_by).toBe(b);
  }, 60000);

  it('keeps the previous values so a bad edit can be undone', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann'); const b = await addUser(db, 'Bo');
    await fix(db, a, { cal: 180 });
    await fix(db, b, { cal: 9999 - 5000 });
    const edits = (await db.query(`select * from public.barcode_product_edits order by created_at, id`)).rows;
    expect(edits).toHaveLength(2);
    expect(edits[0].old_values).toBeNull();
    expect(Number(edits[1].old_values.calories)).toBe(180);
    expect(Number(edits[1].new_values.calories)).toBe(4999);
    expect(edits[1].edited_by).toBe(b);
  }, 60000);

  it('rejects impossible numbers and bad barcodes', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await rejects(fix(db, a, { cal: 5001 }), /barcode_fix_invalid/);
    await rejects(fix(db, a, { cal: -1 }), /barcode_fix_invalid/);
    await rejects(fix(db, a, { protein: 1001 }), /barcode_fix_invalid/);
    await rejects(fix(db, a, { barcode: 'abc' }), /barcode_fix_invalid/);
    await rejects(fix(db, a, { name: '  ' }), /barcode_fix_invalid/);
    expect(await product(db)).toBeUndefined();
  }, 60000);

  it('stores millilitres for a drink', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await fix(db, a, { unit: 'ml', grams: 250, serving: '1 can' });
    expect((await product(db)).serving_unit).toBe('ml');
  }, 60000);

  it('is rate limited per person', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await db.query(`insert into public.rate_limits (key, hits) values ($1, 30)`, [`barcode_fix:${a}`]);
    await rejects(fix(db, a), /barcode_fix_rate_limited/);
  }, 60000);

  it('needs a signed-in user, and nobody can write products or the history directly', async () => {
    const db = await createDb();
    const a = await addUser(db, 'Ann');
    await rejects(db.query(`select public.barcode_correct('9300000000017','x',null,null,null,'g',1,0,0,0,0,0,0)`), /permission denied|Not signed in/);
    await fix(db, a);
    await as(db, a, `update public.barcode_products set calories = 1 where barcode = '9300000000017'`);
    expect(Number((await product(db)).calories)).toBe(180); // RLS: no update policy
    expect((await as(db, a, `select * from public.barcode_product_edits`)).rows).toHaveLength(0);
  }, 60000);
});
