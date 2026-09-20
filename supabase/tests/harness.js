// In-process Postgres (PGlite) harness for testing supabase/schema.sql —
// RLS policies, SECURITY DEFINER functions and triggers — without a real
// Supabase project. It stubs only the pieces of Supabase the schema leans
// on (the auth/storage schemas, auth.uid()/auth.role(), the three API
// roles) and then loads the real schema.sql, so tests exercise the exact
// SQL that gets pasted into the dashboard, not a copy of it.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
`;

export function readSchema() {
  return readFileSync(join(here, '..', 'schema.sql'), 'utf8');
}

// Returns one appended migration block (from its `-- ═══` header comment
// through to the next such header, or end of file) so a test can re-run it
// on a database that already has it applied.
export function sliceMigration(titleFragment) {
  const lines = readSchema().split('\n');
  const isHeader = (l) => l.startsWith('-- ═══');
  const titleIdx = lines.findIndex((l) => l.includes(titleFragment));
  if (titleIdx < 0) throw new Error(`No migration titled "${titleFragment}"`);
  let start = titleIdx;
  while (start > 0 && !isHeader(lines[start])) start--;
  let end = titleIdx + 1;
  while (end < lines.length && !isHeader(lines[end])) end++;
  // A block is header / title / header, so skip past its own closing rule.
  if (end < lines.length && end - start <= 3) {
    end++;
    while (end < lines.length && !isHeader(lines[end])) end++;
  }
  return lines.slice(start, end).join('\n');
}

export async function createDb({ extraSql = [] } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUBS);
  await db.exec(readSchema());
  for (const sql of extraSql) await db.exec(sql);
  return db;
}

// Creates a signed-up user the way Supabase would: an auth.users row, which
// the schema's own trigger (if any) turns into a profiles row.
export async function addUser(db, name, { coachPass = false } = {}) {
  const { rows } = await db.query(
    `insert into auth.users (email) values ($1) returning id`, [`${name.toLowerCase()}@example.test`]
  );
  const id = rows[0].id;
  await db.query(
    `insert into public.profiles (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name`,
    [id, name]
  );
  if (coachPass) await asService(db, (q) => q(`update public.profiles set coach_pass = true, coach_pass_status = 'active' where id = $1`, [id]));
  return id;
}

// Runs `fn` with the connection acting as a given signed-in user (RLS on,
// auth.uid() = userId) — the same situation as a browser using the anon key
// plus that user's JWT.
export async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)`, [userId]);
  try {
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)`);
  }
}

// Acts as the service role (webhooks, cron) — bypasses RLS entirely.
export async function asService(db, fn) {
  await db.exec(`set role service_role`);
  await db.query(`select set_config('request.jwt.claim.role', 'service_role', false)`);
  try {
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.role', '', false)`);
  }
}
