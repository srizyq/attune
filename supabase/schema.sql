-- Attune: Phase 1 schema. Paste this into the Supabase SQL editor
-- (Project → SQL Editor → New query) and run it once.

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  goal text check (goal in ('lose', 'maintain', 'build')),
  age int,
  date_of_birth date,
  sex text check (sex in ('male', 'female', 'unspecified')) default 'unspecified',
  weight numeric,
  target_weight numeric,
  height numeric,
  unit text check (unit in ('metric', 'imperial')) default 'metric',
  activity text check (activity in ('sedentary', 'light', 'moderate', 'very')),
  pace_kg_per_week numeric,
  calorie_target int,
  protein_g int,
  carbs_g int,
  fat_g int,
  calorie_mode text check (calorie_mode in ('calculated', 'custom', 'adaptive')) default 'calculated',
  water_target int default 8,
  onboarding_completed boolean default false,
  is_premium boolean default false,
  coach_pass boolean not null default false,
  coach_mode boolean not null default false,
  coach_invite_code text unique,
  theme text check (theme in ('light', 'dark')) default 'dark',
  reminder_enabled boolean default false,
  reminder_time text default '19:00',
  reminder_timezone text,
  reminder_last_sent_date date,
  photo_scans_used int not null default 0,
  photo_scans_period_start date not null default current_date,
  menu_scans_used int not null default 0,
  menu_scans_period_start date not null default current_date,
  -- Pro-only custom micronutrient targets, keyed by the same camelCase
  -- names Nutrients.jsx already uses for totals (fibre, sodium, sugar,
  -- saturatedFat, transFat, cholesterol, addedSugar, potassium, vitaminD,
  -- calcium, iron, vitaminA, vitaminC, vitaminB12, folate, magnesium,
  -- zinc, polyunsaturatedFat, monounsaturatedFat) — value is a plain
  -- number in that nutrient's display unit. A nutrient missing from this
  -- object means "use the default guideline", not "target is 0".
  micro_targets jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- ── food_logs ───────────────────────────────────────────────────────────────
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_name text not null,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  saturated_fat_g numeric default 0,
  trans_fat_g numeric default 0,
  cholesterol_mg numeric default 0,
  potassium_mg numeric default 0,
  added_sugar_g numeric default 0,
  vitamin_d_mcg numeric default 0,
  calcium_mg numeric default 0,
  iron_mg numeric default 0,
  vitamin_a_mcg numeric default 0,
  vitamin_c_mg numeric default 0,
  polyunsaturated_fat_g numeric default 0,
  monounsaturated_fat_g numeric default 0,
  magnesium_mg numeric default 0,
  zinc_mg numeric default 0,
  vitamin_b12_mcg numeric default 0,
  folate_mcg numeric default 0,
  serving_grams numeric,
  logged_at timestamptz,
  source text,
  logged_amount numeric,
  logged_unit text check (logged_unit in ('serving', 'g', 'kg', 'lb', 'oz')),
  created_at timestamptz default now()
);

create index if not exists food_logs_user_date_idx on public.food_logs (user_id, logged_date);

alter table public.food_logs enable row level security;

create policy "food_logs: select own" on public.food_logs
  for select using (auth.uid() = user_id);
create policy "food_logs: insert own" on public.food_logs
  for insert with check (auth.uid() = user_id);
create policy "food_logs: update own" on public.food_logs
  for update using (auth.uid() = user_id);
create policy "food_logs: delete own" on public.food_logs
  for delete using (auth.uid() = user_id);

-- ── checkins ────────────────────────────────────────────────────────────────
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  mood text check (mood in ('great', 'good', 'okay', 'low', 'tired')),
  energy int check (energy between 1 and 10),
  water_glasses int default 0,
  note text,
  created_at timestamptz default now(),
  unique (user_id, checkin_date)
);

alter table public.checkins enable row level security;

create policy "checkins: select own" on public.checkins
  for select using (auth.uid() = user_id);
create policy "checkins: insert own" on public.checkins
  for insert with check (auth.uid() = user_id);
create policy "checkins: update own" on public.checkins
  for update using (auth.uid() = user_id);

-- ── weight_logs ─────────────────────────────────────────────────────────────
-- One entry per day (unique per user+date, upsert on conflict) so logging
-- again the same day just updates rather than creating duplicates.
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  weight numeric not null,
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  created_at timestamptz default now(),
  unique (user_id, logged_date)
);

alter table public.weight_logs enable row level security;

create policy "weight_logs: select own" on public.weight_logs
  for select using (auth.uid() = user_id);
create policy "weight_logs: insert own" on public.weight_logs
  for insert with check (auth.uid() = user_id);
create policy "weight_logs: update own" on public.weight_logs
  for update using (auth.uid() = user_id);
create policy "weight_logs: delete own" on public.weight_logs
  for delete using (auth.uid() = user_id);

-- ── custom_foods ────────────────────────────────────────────────────────────
-- User-created foods that aren't in the USDA/Open Food Facts/curated
-- databases (MyFitnessPal-style "Create a Food"). Once created, these show
-- up in that user's own search results and quick-add going forward.
create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  serving_label text not null default '1 serving',
  serving_grams numeric,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  created_at timestamptz default now()
);

alter table public.custom_foods enable row level security;

create policy "custom_foods: select own" on public.custom_foods
  for select using (auth.uid() = user_id);
create policy "custom_foods: insert own" on public.custom_foods
  for insert with check (auth.uid() = user_id);
create policy "custom_foods: delete own" on public.custom_foods
  for delete using (auth.uid() = user_id);

-- ── saved_meals ─────────────────────────────────────────────────────────────
-- A named bundle of foods (MyFitnessPal-style "Meals"/recipes) that logs as
-- one action. `items` is a snapshot of each food's macros at save time, so a
-- saved meal still logs correctly even if the source food later changes.
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table public.saved_meals enable row level security;

create policy "saved_meals: select own" on public.saved_meals
  for select using (auth.uid() = user_id);
create policy "saved_meals: insert own" on public.saved_meals
  for insert with check (auth.uid() = user_id);
create policy "saved_meals: delete own" on public.saved_meals
  for delete using (auth.uid() = user_id);

-- ── favourite_foods ─────────────────────────────────────────────────────────
-- Foods the user has manually starred for quick access, snapshotted at the
-- time of favouriting (like custom_foods/saved_meals) since a favourite can
-- come from any live search source (FatSecret, Open Food Facts), not just
-- our own tables. Unique per (user, name) so starring twice just re-saves.
create table if not exists public.favourite_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  serving_label text not null default '1 serving',
  serving_grams numeric,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  saturated_fat_g numeric default 0,
  trans_fat_g numeric default 0,
  cholesterol_mg numeric default 0,
  potassium_mg numeric default 0,
  added_sugar_g numeric default 0,
  vitamin_d_mcg numeric default 0,
  calcium_mg numeric default 0,
  iron_mg numeric default 0,
  source text,
  created_at timestamptz default now(),
  unique (user_id, name)
);

alter table public.favourite_foods enable row level security;

create policy "favourite_foods: select own" on public.favourite_foods
  for select using (auth.uid() = user_id);
create policy "favourite_foods: insert own" on public.favourite_foods
  for insert with check (auth.uid() = user_id);
create policy "favourite_foods: update own" on public.favourite_foods
  for update using (auth.uid() = user_id);
create policy "favourite_foods: delete own" on public.favourite_foods
  for delete using (auth.uid() = user_id);

-- ── push_subscriptions ──────────────────────────────────────────────────────
-- Browser push subscriptions for reminder notifications. One row per
-- device/browser (a user logged in on two devices gets two rows). Only
-- ever written by the client for their own rows; only ever read by the
-- send-reminders cron job, which uses the service-role key and so bypasses
-- RLS entirely (it needs to read across all users, not just one).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: select own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions: insert own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions: delete own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── coach mode (schema update — run against an existing DB) ────────────────
-- profiles gained coach_pass/coach_mode/coach_invite_code above; on a DB
-- that already has a profiles table from before this update, the CREATE
-- TABLE above is a no-op, so add them explicitly too.
alter table public.profiles add column if not exists coach_pass boolean not null default false;
alter table public.profiles add column if not exists coach_mode boolean not null default false;
alter table public.profiles add column if not exists coach_invite_code text unique;

-- ── trainer_clients ─────────────────────────────────────────────────────────
-- Links a coach-pass trainer to a client who redeemed their invite code.
-- Rows are only ever created by redeem_coach_invite_code() below (no insert
-- policy is granted directly), so a link always implies the code was
-- actually valid at the time — "revoked" instead of deleted so history and
-- past trainer_comments survive a client disconnecting.
create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz default now(),
  unique (trainer_id, client_id)
);

create index if not exists trainer_clients_trainer_idx on public.trainer_clients (trainer_id);
create index if not exists trainer_clients_client_idx on public.trainer_clients (client_id);

alter table public.trainer_clients enable row level security;

create policy "trainer_clients: select as trainer or client" on public.trainer_clients
  for select using (auth.uid() = trainer_id or auth.uid() = client_id);
create policy "trainer_clients: trainer can update status" on public.trainer_clients
  for update using (auth.uid() = trainer_id);
create policy "trainer_clients: client can update status" on public.trainer_clients
  for update using (auth.uid() = client_id);

-- Trainer read access to a connected client's own data, layered on top of
-- each table's existing "select own" policy (RLS policies are OR'd
-- together, so this only ever widens access, never narrows it).
create policy "profiles: select as trainer of client" on public.profiles
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = profiles.id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );
create policy "food_logs: select as trainer of client" on public.food_logs
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = food_logs.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );
create policy "weight_logs: select as trainer of client" on public.weight_logs
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = weight_logs.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );
create policy "checkins: select as trainer of client" on public.checkins
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = checkins.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );

-- ── trainer_comments ────────────────────────────────────────────────────────
-- A trainer's running notes on a client, optionally pinned to one day
-- (comment_date null = a general note, not tied to any specific date).
create table if not exists public.trainer_comments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  comment_date date,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists trainer_comments_client_idx on public.trainer_comments (client_id, created_at);

alter table public.trainer_comments enable row level security;

create policy "trainer_comments: select as trainer or client" on public.trainer_comments
  for select using (auth.uid() = trainer_id or auth.uid() = client_id);
create policy "trainer_comments: trainer can insert for own active client" on public.trainer_comments
  for insert with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.client_id = trainer_comments.client_id and tc.status = 'active'
    )
  );
create policy "trainer_comments: trainer can update own" on public.trainer_comments
  for update using (auth.uid() = trainer_id);
create policy "trainer_comments: trainer can delete own" on public.trainer_comments
  for delete using (auth.uid() = trainer_id);

-- ── redeem_coach_invite_code ─────────────────────────────────────────────────
-- SECURITY DEFINER so a client can look up a trainer by invite code without
-- a broad "read any profile" policy — this function is the only path that
-- writes trainer_clients. Codes are stored/compared upper-cased so the
-- client's input is case-insensitive.
create or replace function public.redeem_coach_invite_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer_id uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Enter an invite code';
  end if;

  select id into v_trainer_id
  from public.profiles
  where coach_invite_code = upper(trim(p_code))
    and coach_pass = true;

  if v_trainer_id is null then
    raise exception 'That invite code is invalid or no longer active';
  end if;

  if v_trainer_id = auth.uid() then
    raise exception 'You can''t connect to your own coach account';
  end if;

  insert into public.trainer_clients (trainer_id, client_id, status)
  values (v_trainer_id, auth.uid(), 'active')
  on conflict (trainer_id, client_id) do update set status = 'active';

  return v_trainer_id;
end;
$$;

revoke all on function public.redeem_coach_invite_code(text) from public;
grant execute on function public.redeem_coach_invite_code(text) to authenticated;

-- ── anonymous (guest) sign-ins ─────────────────────────────────────────────
-- In the Supabase dashboard: Authentication → Sign In / Providers →
-- enable "Allow anonymous sign-ins". Required for the app's guest mode.

-- ── barcode_products ─────────────────────────────────────────────────────
-- Community-contributed nutrition data for barcodes not found in
-- FatSecret or Open Food Facts — filled in from a photo of the product's
-- own nutrition label (see api/recognize-label.js), shared across all
-- users so the next person who scans the same barcode gets an instant
-- hit instead of retyping it. First submission for a given barcode wins
-- (barcode is the primary key); RLS lets any signed-in user read every
-- row and insert new ones, but there's no update/delete policy — fixing
-- a bad entry isn't handled in v1.
create table if not exists public.barcode_products (
  barcode text primary key,
  name text not null,
  brand text,
  serving text,
  serving_grams numeric,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);

alter table public.barcode_products enable row level security;

create policy "barcode_products: select any signed-in user" on public.barcode_products
  for select using (auth.uid() is not null);
create policy "barcode_products: insert any signed-in user" on public.barcode_products
  for insert with check (auth.uid() = created_by);

-- ── onboarding: sex, DOB, target weight, pace (schema update — run against
-- an existing DB) ────────────────────────────────────────────────────────
-- Same story as coach_pass above: the CREATE TABLE is a no-op against a DB
-- that already has profiles, so these are added explicitly too.
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists sex text check (sex in ('male', 'female', 'unspecified')) default 'unspecified';
alter table public.profiles add column if not exists target_weight numeric;
alter table public.profiles add column if not exists pace_kg_per_week numeric;

-- ── afcd_foods ──────────────────────────────────────────────────────────────
-- A read-only reference table of Australian foods from FSANZ's Australian
-- Food Composition Database (Release 3, licensed CC BY-SA 3.0 AU — see
-- https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd).
-- Values are per 100g. Populated once via supabase/afcd_import.sql, not
-- user-contributed — no insert policy is granted, unlike barcode_products.
create table if not exists public.afcd_foods (
  id text primary key,
  name text not null,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  vitamin_a_mcg numeric default 0,
  vitamin_c_mg numeric default 0,
  polyunsaturated_fat_g numeric default 0,
  monounsaturated_fat_g numeric default 0,
  magnesium_mg numeric default 0,
  zinc_mg numeric default 0,
  vitamin_b12_mcg numeric default 0,
  folate_mcg numeric default 0,
  created_at timestamptz default now()
);

alter table public.afcd_foods enable row level security;

create policy "afcd_foods: select any signed-in user" on public.afcd_foods
  for select using (auth.uid() is not null);

-- ── afcd_foods: fuzzy fallback (typo tolerance) ────────────────────────────
-- The app's normal AFCD search requires every search word as an exact
-- substring (see searchAfcdFoods in src/lib/db.js), which is correct for
-- word-order but still misses typos ("chiken" won't find "chicken"). This
-- function is called only as a fallback when that exact search returns
-- nothing, using Postgres's trigram similarity instead of substring
-- matching so near-misses still resolve.
create extension if not exists pg_trgm;

create index if not exists afcd_foods_name_trgm_idx
  on public.afcd_foods using gin (name gin_trgm_ops);

create or replace function public.search_afcd_foods_fuzzy(search_query text, match_limit int default 15)
returns setof public.afcd_foods
language sql
stable
as $$
  select *
  from public.afcd_foods
  where similarity(name, search_query) > 0.2
  order by similarity(name, search_query) desc
  limit match_limit;
$$;

grant execute on function public.search_afcd_foods_fuzzy(text, int) to authenticated;

-- ── Pro micronutrients (schema update — run against an existing DB) ────────
-- Same story as coach_pass above: the CREATE TABLE blocks above are a
-- no-op against a DB that already has these tables, so add the new
-- columns explicitly here too. These extra micronutrients (beyond the
-- existing basics) are Pro-gated in the app — see Nutrients.jsx.
alter table public.food_logs add column if not exists vitamin_a_mcg numeric default 0;
alter table public.food_logs add column if not exists vitamin_c_mg numeric default 0;
alter table public.food_logs add column if not exists polyunsaturated_fat_g numeric default 0;
alter table public.food_logs add column if not exists monounsaturated_fat_g numeric default 0;
alter table public.food_logs add column if not exists magnesium_mg numeric default 0;
alter table public.food_logs add column if not exists zinc_mg numeric default 0;
alter table public.food_logs add column if not exists vitamin_b12_mcg numeric default 0;
alter table public.food_logs add column if not exists folate_mcg numeric default 0;

alter table public.afcd_foods add column if not exists vitamin_a_mcg numeric default 0;
alter table public.afcd_foods add column if not exists vitamin_c_mg numeric default 0;
alter table public.afcd_foods add column if not exists polyunsaturated_fat_g numeric default 0;
alter table public.afcd_foods add column if not exists monounsaturated_fat_g numeric default 0;
alter table public.afcd_foods add column if not exists magnesium_mg numeric default 0;
alter table public.afcd_foods add column if not exists zinc_mg numeric default 0;
alter table public.afcd_foods add column if not exists vitamin_b12_mcg numeric default 0;
alter table public.afcd_foods add column if not exists folate_mcg numeric default 0;

-- ── Pro custom micronutrient targets (schema update — run against an
-- existing DB) ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists micro_targets jsonb not null default '{}'::jsonb;
