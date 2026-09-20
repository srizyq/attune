import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDb, createDbFromSql, readSchema } from './harness.js';
import { buildBundle, baselineSql, bundleBlocks } from '../../scripts/build-migration-bundle.mjs';

const bundleOnDisk = readFileSync(new URL('../pending-migrations.sql', import.meta.url), 'utf8');

// A comparable description of a database's public schema: every function's
// definition, every table's columns (with types, nullability, defaults), every
// policy and every constraint.
async function describeSchema(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).join(' | '));
  return {
    functions: await q(`select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by p.proname, pg_get_function_identity_arguments(p.oid)`),
    columns: await q(`select table_name, column_name, data_type, is_nullable, coalesce(column_default, '') from information_schema.columns where table_schema = 'public' order by table_name, column_name`),
    policies: await q(`select tablename, policyname, cmd, coalesce(qual, ''), coalesce(with_check, '') from pg_policies where schemaname = 'public' order by tablename, policyname`),
    constraints: await q(`select conrelid::regclass::text, conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    triggers: await q(`select tgrelid::regclass::text, tgname from pg_trigger where not tgisinternal order by 1, 2`),
  };
}

describe('supabase/pending-migrations.sql', () => {
  it('is exactly what the generator produces from schema.sql (regenerate with scripts/build-migration-bundle.mjs)', () => {
    expect(bundleOnDisk).toBe(buildBundle(readSchema()));
  });

  it('contains every block from the consent block onward, in order, and nothing older', () => {
    const titles = bundleBlocks(readSchema()).map((b) => b.title);
    expect(titles[0]).toBe('Coach consent + per-client invites');
    expect(titles.at(-1)).toBe('Favourite foods: all nutrients');
    expect(titles).toContain('Coach teams');
    expect(titles).toHaveLength(11);
    titles.forEach((t, i) => expect(bundleOnDisk).toContain(`--   ${String(i + 1).padStart(2)}. ${t}`));
  });

  it('applied to the schema as it stood before these updates, gives exactly the full current schema', async () => {
    const before = await createDbFromSql(baselineSql(readSchema()));
    await before.exec(bundleOnDisk);
    const full = await createDb();
    const a = await describeSchema(before);
    const b = await describeSchema(full);
    for (const key of Object.keys(b)) expect(a[key], key).toEqual(b[key]);
  }, 180000);

  it('is safe to run twice in a row (a paste-and-re-run in the SQL editor)', async () => {
    const db = await createDbFromSql(baselineSql(readSchema()));
    await db.exec(bundleOnDisk);
    const once = await describeSchema(db);
    await db.exec(bundleOnDisk);
    const twice = await describeSchema(db);
    expect(twice).toEqual(once);
  }, 180000);

  it('can be run on a database that already has some (or all) of it', async () => {
    const full = await createDb();
    await full.exec(bundleOnDisk);
    const after = await describeSchema(full);
    expect(after.functions.length).toBeGreaterThan(50);
  }, 180000);
});
