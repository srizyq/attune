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
  -- 'ml' added alongside the mass units for liquid foods (see unitsFor in
  -- src/lib/foodMath.js) — a serving of a drink is measured in ml, not a
  -- mass unit its own label never used.
  logged_unit text check (logged_unit in ('serving', 'g', 'kg', 'lb', 'oz', 'ml')),
  -- Free-text portion description (e.g. "1 medium bowl (~350g)", "1 bottle
  -- (500ml)") for entries that don't have a clean logged_amount+logged_unit
  -- to reconstruct a display label from — an AI photo/menu scan estimate,
  -- or a barcode product's own printed serving. Recent/Frequent show this
  -- as the row's subtitle (MyFitnessPal-style "213 cal, 3 egg omelette")
  -- instead of a generic "Logged before" whenever it's set.
  serving_label text,
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
-- User-created foods that aren't in the FatSecret/Open Food Facts/AFCD
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

-- ── saved_meals (Recipes) ───────────────────────────────────────────────────
-- A named bundle of ingredients that logs as one action. `items` is a
-- snapshot of each ingredient's macros (and, since the Recipes upgrade,
-- its serving_grams/logged_amount/logged_unit too) at save time, so a
-- recipe still logs correctly even if the source food later changes.
-- `servings` is how many servings the whole bundle makes — logging asks
-- for how many of those servings, scaling the stored totals down to size
-- rather than re-inserting every ingredient at its full recorded amount.
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  servings numeric not null default 1,
  created_at timestamptz default now()
);

alter table public.saved_meals enable row level security;

create policy "saved_meals: select own" on public.saved_meals
  for select using (auth.uid() = user_id);
create policy "saved_meals: insert own" on public.saved_meals
  for insert with check (auth.uid() = user_id);
create policy "saved_meals: update own" on public.saved_meals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved_meals: delete own" on public.saved_meals
  for delete using (auth.uid() = user_id);

-- Schema update — run against an existing DB that already has saved_meals
-- from before the Recipes upgrade (the CREATE TABLE above is a no-op there).
alter table public.saved_meals add column if not exists servings numeric not null default 1;

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
-- savePushSubscription (lib/db.js) upserts on conflict('endpoint') — a
-- device's push endpoint stays the same across re-subscribes, so any
-- second enable (or enabling a second notification type on the same
-- device, which reuses the one subscription) lands on that existing row
-- and Postgres runs it as an UPDATE via the ON CONFLICT DO UPDATE
-- clause. Postgres requires UPDATE permission for that regardless of
-- whether a conflict actually occurs, so without this policy every
-- upsert past the very first one on a device fails with "new row
-- violates row-level security policy (USING expression)" — confirmed
-- by reproducing it directly against the live table.
create policy "push_subscriptions: update own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

-- Whether serving_grams is actually grams or millilitres — this table
-- only ever had grams, so a community-submitted drink (this is the
-- "barcode not found anywhere" fallback form, and plenty of unbarcoded
-- products are drinks) silently anchored to a 'g' unit and offered
-- kg/lb/oz instead of ml when someone else later scanned it. Same
-- distinction FatSecret/Open Food Facts lookups already carry (see
-- unitsFor in src/lib/foodMath.js).
alter table public.barcode_products add column if not exists serving_unit text
  check (serving_unit in ('g', 'ml')) default 'g';

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

-- ── afcd_foods (superseded — see ausnut_foods below) ────────────────────────
-- AFCD only ever had 1,588 foods (confirmed against FSANZ's own site, not a
-- partial import) — replaced by ausnut_foods, which is 3,741 foods built
-- from these same AFCD analytical values plus more recipes/preparations.
-- The app no longer queries this table (searchAfcdFoods/searchAfcd were
-- renamed to searchAusnutFoods/searchAusnut and point at the new table).
-- Left in place rather than dropped — no downstream references anywhere
-- (confirmed: afcd_foods.id is never persisted as a FK), just unused.
--
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

-- ── set_client_targets ──────────────────────────────────────────────────────
-- Lets a trainer set a connected client's calorie/macro targets directly
-- (the "PT" part of Coach Mode) without a broad "trainer can update any
-- profile column" policy — this SECURITY DEFINER function only ever
-- touches these four columns, and only for a client with an active link
-- to the calling trainer. Switches the client to 'custom' calorie mode so
-- their own Settings page shows exactly what the trainer set instead of
-- silently recomputing over it.
create or replace function public.set_client_targets(
  p_client_id uuid,
  p_calorie_target int default null,
  p_protein_g int default null,
  p_carbs_g int default null,
  p_fat_g int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = auth.uid() and client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Not an active trainer for this client';
  end if;

  update public.profiles
  set calorie_target = coalesce(p_calorie_target, calorie_target),
      protein_g = coalesce(p_protein_g, protein_g),
      carbs_g = coalesce(p_carbs_g, carbs_g),
      fat_g = coalesce(p_fat_g, fat_g),
      calorie_mode = 'custom',
      updated_at = now()
  where id = p_client_id;
end;
$$;

revoke all on function public.set_client_targets(uuid, int, int, int, int) from public;
grant execute on function public.set_client_targets(uuid, int, int, int, int) to authenticated;

-- ── trainer_comments categories (schema update — run against an existing
-- DB) ────────────────────────────────────────────────────────────────────
-- Lets a comment route to a specific spot in the client's own app (a
-- 'weight' comment on their Progress page, 'nutrition' on their Daily
-- Log, 'checkin' near their check-in, 'general' on Dashboard) instead of
-- only ever showing up inside Coach Mode.
alter table public.trainer_comments add column if not exists category text not null default 'general'
  check (category in ('general', 'weight', 'nutrition', 'checkin'));

-- A client needs to read their own trainer's name (for "Coach Alex" on
-- these comment cards) — the existing profiles policies only cover a
-- user's own profile and a trainer's read of an active client's profile,
-- not this direction, so add the missing one.
create policy "profiles: select own trainer" on public.profiles
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = profiles.id and tc.client_id = auth.uid() and tc.status = 'active'
    )
  );

-- ── two-way messaging, client grouping, recipe sharing, branding ───────────
-- (schema update — run against an existing DB)

-- Who actually wrote a trainer_comments row — only 'general' category
-- messages are a real back-and-forth thread (shown as chat on the
-- client's Dashboard); weight/nutrition/checkin stay one-way trainer
-- annotations anchored to their page, same as before.
alter table public.trainer_comments add column if not exists sender_role text not null default 'trainer'
  check (sender_role in ('trainer', 'client'));

create policy "trainer_comments: client can reply in general thread" on public.trainer_comments
  for insert with check (
    auth.uid() = client_id
    and category = 'general'
    and sender_role = 'client'
    and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = auth.uid() and tc.trainer_id = trainer_comments.trainer_id and tc.status = 'active'
    )
  );

-- A free-text label a trainer sets per client (e.g. "Weight loss",
-- "Marathon prep") to group the client list — no separate groups table,
-- just a column on the link row.
alter table public.trainer_clients add column if not exists group_label text;

-- Trainer's uploaded logo, shown to their clients — see the storage
-- bucket + policies below for the actual file.
alter table public.profiles add column if not exists coach_logo_url text;

-- share_recipe_with_client: copies one of the trainer's own saved_meals
-- into a connected client's saved_meals. SECURITY DEFINER for the same
-- reason as set_client_targets — saved_meals' own RLS only allows
-- inserting your own rows, and this is the one deliberate exception.
create or replace function public.share_recipe_with_client(p_client_id uuid, p_name text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = auth.uid() and client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Not an active trainer for this client';
  end if;

  insert into public.saved_meals (user_id, name, items)
  values (p_client_id, p_name, p_items)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.share_recipe_with_client(uuid, text, jsonb) from public;
grant execute on function public.share_recipe_with_client(uuid, text, jsonb) to authenticated;

-- ── coach-logos storage bucket ──────────────────────────────────────────────
-- Public read (clients need to display it, and a logo isn't sensitive);
-- write restricted to the owning trainer, one logo per user at path
-- `<user_id>/logo.<ext>` so re-uploading just overwrites it.
insert into storage.buckets (id, name, public)
values ('coach-logos', 'coach-logos', true)
on conflict (id) do nothing;

create policy "coach-logos: public read" on storage.objects
  for select using (bucket_id = 'coach-logos');

create policy "coach-logos: owner can upload" on storage.objects
  for insert with check (bucket_id = 'coach-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "coach-logos: owner can update" on storage.objects
  for update using (bucket_id = 'coach-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "coach-logos: owner can delete" on storage.objects
  for delete using (bucket_id = 'coach-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Stripe billing fields ───────────────────────────────────────────────────
-- coach_pass itself (added earlier) becomes the webhook-controlled
-- source of truth once billing is live, instead of the manual test
-- toggle it started as.
alter table public.profiles add column if not exists stripe_customer_id text unique;
alter table public.profiles add column if not exists stripe_subscription_id text;
-- Full Stripe subscription-status vocabulary, not just the three statuses
-- that happen to flip is_premium/coach_pass — the webhook (stripe-
-- webhook.js) writes sub.status here verbatim on every
-- customer.subscription.updated event, and Stripe also sends trialing,
-- incomplete, incomplete_expired, unpaid and paused. Any of those hitting
-- a narrower constraint throws, the webhook returns 500, and Stripe
-- retries the same failing delivery indefinitely while the pass's real
-- status (and, for a plan-defining status change, is_premium/coach_pass
-- itself) never gets recorded.
alter table public.profiles add column if not exists coach_pass_status text
  check (coach_pass_status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

-- ── Pro billing fields ──────────────────────────────────────────────────────
-- is_premium itself (already existed as a manual test toggle) becomes the
-- webhook-controlled source of truth for Pro too, same as coach_pass above.
-- A separate stripe_pro_subscription_id rather than reusing
-- stripe_subscription_id — one Stripe customer can hold both a Coach Pass
-- and a Pro subscription at once, each with its own subscription id, and
-- the webhook needs to tell them apart on renewal/cancellation events.
alter table public.profiles add column if not exists stripe_pro_subscription_id text;
-- Same full Stripe status vocabulary as coach_pass_status above.
alter table public.profiles add column if not exists pro_status text
  check (pro_status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

-- ── Free Pro trial ───────────────────────────────────────────────────────────
-- A 30-day, no-card-required Pro trial, set once an account attaches real
-- credentials (supabase.auth.updateUser({email, password}) on the
-- anonymous user created at onboarding — see onboarding/Step4.jsx and
-- Profile.jsx's UpgradeForm, the only two places that call it) — not at
-- profiles row creation itself, which happens at guest-account creation,
-- before anyone has actually "signed up" for anything. Deliberately NOT
-- backfilled for existing accounts: this column stays null for every
-- profile that existed before this shipped, and null is treated as "never
-- had a trial", not "an expired one" (see src/lib/trial.js) — so nobody's
-- current access changes the moment this deploys. is_premium itself is
-- never written to reflect an active trial; every trial check is done
-- live against trial_ends_at instead, the same reasoning compGrants.js
-- uses for comp accounts — a stored is_premium:true would need something
-- to remember to flip it back false again 30 days later, and drift the
-- moment that something failed to run.
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- ── Daily log view preference (Pro) ─────────────────────────────────────────
-- Pro users could previously only ever see the hourly timeline (free users
-- are locked to the meal-grouped view) — this lets a Pro user pick either,
-- read from both Dashboard's daily log and the full /log page so a choice
-- made on one matches the other instead of being page-local UI state. Null
-- (not yet chosen) defaults to 'hourly' in the app, preserving the only
-- behavior that existed before this column did.
alter table public.profiles add column if not exists daily_log_view text
  check (daily_log_view in ('hourly', 'meals'));

-- ── Trainer-comment push notifications ──────────────────────────────────────
-- Settings > Notifications' "Trainer updates" toggle used to be a hardcoded
-- "coming soon" no-op even though the underlying push infrastructure
-- (push_subscriptions, VAPID, web-push — see api/send-reminders.js) already
-- existed for reminders. This flag is the client's opt-in; the trainer's
-- side of addComment (useCoach.js) calls api/notify-trainer-comment.js right
-- after a successful insert, which checks this before sending.
alter table public.profiles add column if not exists notify_trainer_comments boolean default false;

-- ── Workout logs ─────────────────────────────────────────────────────────────
-- Manual workout logging (Dashboard's Activity card) — type/duration/
-- intensity/calories, same shape whether calories came from the MET-based
-- estimate (lib/workoutMath.js) or was overridden by hand. calories_burned
-- feeds back into the day's calorie budget (Dashboard adds it to the
-- target, same "eat back exercise calories" behavior most trackers use).
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  type text not null,
  intensity text not null check (intensity in ('light', 'moderate', 'intense')),
  duration_minutes numeric not null,
  calories_burned numeric not null default 0,
  created_at timestamptz default now()
);

create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, logged_date);

alter table public.workout_logs enable row level security;

create policy "workout_logs: select own" on public.workout_logs
  for select using (auth.uid() = user_id);
create policy "workout_logs: insert own" on public.workout_logs
  for insert with check (auth.uid() = user_id);
create policy "workout_logs: update own" on public.workout_logs
  for update using (auth.uid() = user_id);
create policy "workout_logs: delete own" on public.workout_logs
  for delete using (auth.uid() = user_id);

-- ── common_dishes ──────────────────────────────────────────────────────────
-- A shared (not user-scoped) cache of AI-estimated nutrition for common
-- composite/prepared dishes AFCD handles poorly (curries, pad thai, meat
-- pies, etc. — see scripts/seed-common-dishes/ for how this gets seeded).
-- Per-serving (not per-100g like afcd_foods) since an AI estimate's natural
-- unit is "one typical serving," matching custom_foods' convention. Seeded
-- once via the service_role key (which bypasses RLS) — no insert/update/
-- delete policy is granted, same posture as afcd_foods, since this isn't
-- user-contributed.
create table if not exists public.common_dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  serving_label text not null default '1 serving',
  serving_grams numeric,
  calories numeric not null default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fibre_g numeric default 0,
  sodium_mg numeric default 0,
  sugar_g numeric default 0,
  confidence text check (confidence in ('low','medium','high')) default 'medium',
  source_model text default 'claude-sonnet-5',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists common_dishes_name_unique_idx
  on public.common_dishes (lower(name));

-- A plain unique constraint on `name` too (redundant with the case-insensitive
-- index above for uniqueness purposes, but PostgREST's upsert needs an index
-- whose key exactly matches its ON CONFLICT target — an expression index on
-- lower(name) doesn't satisfy `ON CONFLICT (name)`).
alter table public.common_dishes add constraint common_dishes_name_key unique (name);

alter table public.common_dishes enable row level security;

create policy "common_dishes: select any signed-in user" on public.common_dishes
  for select using (auth.uid() is not null);

-- ── common_dishes: fuzzy fallback (typo tolerance) ──────────────────────────
-- Mirrors search_afcd_foods_fuzzy exactly (pg_trgm is already enabled by
-- the afcd_foods migration above).
create index if not exists common_dishes_name_trgm_idx
  on public.common_dishes using gin (name gin_trgm_ops);

create or replace function public.search_common_dishes_fuzzy(search_query text, match_limit int default 8)
returns setof public.common_dishes
language sql
stable
as $$
  select *
  from public.common_dishes
  where similarity(name, search_query) > 0.2
  order by similarity(name, search_query) desc
  limit match_limit;
$$;

grant execute on function public.search_common_dishes_fuzzy(text, int) to authenticated;

-- ── ausnut_foods ─────────────────────────────────────────────────────────────
-- Replaces afcd_foods (see its block above) as the app's basic/raw-ingredient
-- food source. AUSNUT 2023 (FSANZ/ABS, licensed CC BY 4.0 — see
-- https://foodstandards.gov.au/science-data/food-nutrient-databases/ausnut)
-- is built from AFCD's own analytical values plus additional recipes and
-- preparations — 3,741 foods vs AFCD's 1,588, same "raw ingredient across
-- every common cooking method" shape (e.g. "Chicken, breast, lean, raw" /
-- "...boiled, casseroled, microwaved, poached, steamed or stewed"), not
-- branded products. Values are per 100g, same convention as afcd_foods.
-- Populated once via scripts/import-ausnut/, not user-contributed — no
-- insert policy, same posture as afcd_foods/common_dishes.
create table if not exists public.ausnut_foods (
  id text primary key,
  name text not null,
  -- 'Analysed' (lab-measured) | 'Recipe' (calculated from real ingredient
  -- recipes) | 'Label Data' | 'Borrowed' | 'Imputed' | 'Estimated' — AUSNUT's
  -- own provenance field, stored for future trust/ranking use, not filtered
  -- on yet.
  derivation text,
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

alter table public.ausnut_foods enable row level security;

create policy "ausnut_foods: select any signed-in user" on public.ausnut_foods
  for select using (auth.uid() is not null);

-- ── ausnut_foods: fuzzy fallback (typo tolerance) ───────────────────────────
-- Mirrors search_afcd_foods_fuzzy/search_common_dishes_fuzzy exactly
-- (pg_trgm is already enabled by the afcd_foods migration above).
create index if not exists ausnut_foods_name_trgm_idx
  on public.ausnut_foods using gin (name gin_trgm_ops);

create or replace function public.search_ausnut_foods_fuzzy(search_query text, match_limit int default 15)
returns setof public.ausnut_foods
language sql
stable
as $$
  select *
  from public.ausnut_foods
  where similarity(name, search_query) > 0.2
  order by similarity(name, search_query) desc
  limit match_limit;
$$;

-- ── ausnut_foods: server-side ranked search ─────────────────────────────────
-- AUSNUT's ~2.4x bigger food list than AFCD's exposed a real gap in the old
-- "plain word-boundary filter, no ORDER BY, cap the client-side fetch at 5"
-- approach: for "chicken breast", AUSNUT has 18 matches, and 8 of them are
-- composite items ("Chicken burger, chicken breast, with salad, fast food
-- chain") that happen to come back from Postgres before any of the 10 plain
-- "Chicken, breast, lean, raw"-style entries — a LIMIT 5 without ordering
-- silently drops every single plain entry, not just some. Ordering by
-- length(name) server-side (same tiebreak the client already uses to prefer
-- "Chicken Thigh" over "Chicken, thigh, lean flesh, raw" once both are in
-- the candidate set) fixes this at the source instead of needing an
-- ever-larger LIMIT for broader terms ("rice" alone has 98 matches).
create or replace function public.search_ausnut_foods_ranked(patterns text[], match_limit int default 20)
returns setof public.ausnut_foods
language sql
stable
as $$
  select *
  from public.ausnut_foods
  where name ~* all(patterns)
  order by length(name) asc
  limit match_limit;
$$;

grant execute on function public.search_ausnut_foods_ranked(text[], int) to authenticated;

grant execute on function public.search_ausnut_foods_fuzzy(text, int) to authenticated;

-- ── Protect billing/privilege columns from direct client writes ────────────
-- profiles' "update own" RLS policy (near the top of this file) only
-- restricts which ROW a user can touch (auth.uid() = id) — RLS is
-- row-level, not column-level, so it has never restricted WHICH columns
-- on that row a signed-in user can change. Confirmed live and exploitable
-- with nothing more than a normal user's own session token: a plain
-- REST PATCH to /profiles?id=eq.<own id> with a body of
-- {"is_premium": true, "trial_ends_at": "2099-01-01"} succeeds and
-- applies, completely bypassing Stripe, compGrants.js, and trial.js.
--
-- This reverts any attempted change to the columns below back to
-- whatever they already were, whenever the write isn't coming from the
-- service_role key — which every legitimate writer of these columns
-- already uses (the Stripe webhook, the four AI scan endpoints' usage
-- counters). Silent revert, not a thrown error: a legitimate save that
-- happens to include one of these fields unchanged (e.g. a client
-- spreading a whole profile object back) should still succeed for
-- everything else in the same call rather than failing the entire write.
--
-- coach_invite_code is deliberately NOT in this list — Coach.jsx's own
-- "Generate/Regenerate code" button sets it directly from the client as
-- a normal self-service action, and its `unique` constraint already
-- stops one trainer from claiming another's code.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_premium := old.is_premium;
    new.coach_pass := old.coach_pass;
    new.coach_mode := old.coach_mode;
    new.coach_pass_status := old.coach_pass_status;
    new.pro_status := old.pro_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stripe_pro_subscription_id := old.stripe_pro_subscription_id;
    new.trial_ends_at := old.trial_ends_at;
    new.photo_scans_used := old.photo_scans_used;
    new.photo_scans_period_start := old.photo_scans_period_start;
    new.menu_scans_used := old.menu_scans_used;
    new.menu_scans_period_start := old.menu_scans_period_start;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_profile_columns_trigger on public.profiles;
create trigger protect_privileged_profile_columns_trigger
  before update on public.profiles
  for each row
  execute function public.protect_privileged_profile_columns();

-- ── Protect trainer_clients/trainer_comments identity columns ──────────────
-- Same class of gap as protect_privileged_profile_columns above, but worse:
-- this one lets an attacker act on ANOTHER user's data, not just their own.
-- trainer_clients has two separate UPDATE policies (trainer-side,
-- client-side), neither with an explicit `with check` — Postgres OR's the
-- WITH CHECK across every applicable permissive policy for an UPDATE, not
-- AND's them, so satisfying *either* policy's check for the proposed new
-- row is enough, regardless of which policy is what made the row
-- updatable in the first place. Confirmed exploitable: a user who is
-- client_id on any real row (e.g. from redeeming one legitimate invite
-- code) can UPDATE that row setting trainer_id := auth.uid() AND
-- client_id := <any other user's id> in the same statement — the
-- trainer-side policy's implicit check (auth.uid() = trainer_id) now
-- passes for the new row, so the write succeeds despite the client-side
-- policy's own check failing. That forges a trainer relationship to an
-- arbitrary victim with no invite code, no coach_pass, no consent —
-- redeem_coach_invite_code() is the only intended way to create a link,
-- but this let the RLS hole recreate its effect via UPDATE instead of
-- INSERT. The forged row then grants real read access to the victim's
-- profile/food_logs/weight_logs/checkins (the "select as trainer of
-- client" policies below only ever check trainer_clients) and write
-- access via the SECURITY DEFINER set_client_targets/
-- share_recipe_with_client RPCs, which trust trainer_clients the same way.
--
-- trainer_comments' single "trainer can update own" policy has the
-- narrower version of the same gap: trainer_id is implicitly protected
-- (changing it away from auth.uid() would fail that same check), but
-- client_id is not, so a genuine trainer could retarget an existing
-- comment onto a user who was never their client.
--
-- WITH CHECK can only see the proposed new row, not the old one, so it
-- can't itself express "this column can't change" — hence a trigger,
-- same fix shape as profiles' privileged columns.
create or replace function public.protect_trainer_link_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    new.trainer_id := old.trainer_id;
    new.client_id := old.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_trainer_clients_link_trigger on public.trainer_clients;
create trigger protect_trainer_clients_link_trigger
  before update on public.trainer_clients
  for each row
  execute function public.protect_trainer_link_columns();

drop trigger if exists protect_trainer_comments_link_trigger on public.trainer_comments;
create trigger protect_trainer_comments_link_trigger
  before update on public.trainer_comments
  for each row
  execute function public.protect_trainer_link_columns();


-- ═══════════════════════════════════════════════════════════════════════════
-- Coach consent + per-client invites (schema update — run against an
-- existing DB; safe to re-run). Tests: supabase/tests/coach-links.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- ── has_coach_pass ─────────────────────────────────────────────────────────
-- The single server-side answer to "does this user hold a Coach Pass?".
-- profiles.coach_pass is only the Stripe-driven flag; comp accounts (see
-- src/lib/compGrants.js) get theirs forced on in the React layer instead,
-- so any SQL gate that read the column alone silently rejected comp'd
-- coaches. The list below mirrors COMP_GRANTS' coach_pass entries —
-- src/lib/compGrants.test.js fails if the two ever drift apart.
create or replace function public.has_coach_pass(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select coach_pass from public.profiles where id = p_uid), false)
      or exists (
        select 1 from auth.users u
        where u.id = p_uid
          and lower(u.email) in ('csrreddy9@gmail.com', 'sriramreddy1m@gmail.com', 'erenhdeniz@gmail.com')
      );
$$;
revoke all on function public.has_coach_pass(uuid) from public, anon;
grant execute on function public.has_coach_pass(uuid) to authenticated, service_role;

-- ── trainer_clients: pending state + consent timestamp ─────────────────────
-- 'pending' = the client redeemed a code but hasn't accepted yet. Every
-- trainer-side read policy above already requires status = 'active', so a
-- pending link grants the trainer exactly nothing until the client says yes.
-- consented_at is when the client explicitly accepted; links that predate
-- this change are left active with consented_at null, which is what drives
-- the one-time "here's what your coach can see" notice for them.
alter table public.trainer_clients drop constraint if exists trainer_clients_status_check;
alter table public.trainer_clients add constraint trainer_clients_status_check
  check (status in ('pending', 'active', 'revoked'));
alter table public.trainer_clients add column if not exists consented_at timestamptz;

-- Who may move a link between states. The two UPDATE policies above only
-- say "either party may update the row" — with no column rules, a trainer
-- could flip a client's revoked (or still-pending) link straight to active,
-- undoing a disconnect and bypassing consent entirely. Only the client can
-- activate, only from pending, and revoked is terminal (a fresh invite
-- goes through redeem_coach_invite_code, which re-pends it). Security
-- INVOKER on purpose: current_user is the API role for a direct client
-- write but the function owner inside the SECURITY DEFINER RPCs below, so
-- those RPCs (which enforce their own rules) aren't blocked by this.
create or replace function public.protect_trainer_client_status()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status then
      if new.status = 'active' then
        if old.status = 'pending' and auth.uid() = old.client_id then
          new.consented_at := coalesce(new.consented_at, now());
        else
          new.status := old.status;
        end if;
      elsif new.status = 'pending' then
        new.status := old.status;
      end if;
      -- 'revoked' is allowed from either side, from any state.
    end if;
    if new.consented_at is distinct from old.consented_at
       and auth.uid() is distinct from old.client_id then
      new.consented_at := old.consented_at;
    end if;
    if new.group_label is distinct from old.group_label
       and auth.uid() is distinct from old.trainer_id then
      new.group_label := old.group_label;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_trainer_client_status_trigger on public.trainer_clients;
create trigger protect_trainer_client_status_trigger
  before update on public.trainer_clients
  for each row
  execute function public.protect_trainer_client_status();

-- ── coach_invites ───────────────────────────────────────────────────────────
-- One invite per client: single-use, expiring, individually revocable —
-- replacing the single permanent code shared by every client (still
-- honoured by redeem_coach_invite_code below so nothing already handed out
-- breaks, but the app no longer generates new ones).
create table if not exists public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  label text check (label is null or char_length(label) <= 60),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coach_invites_trainer_idx on public.coach_invites (trainer_id, created_at desc);

alter table public.coach_invites enable row level security;
-- Read-only from the client: creating, redeeming and revoking all go
-- through the RPCs below, which is what makes "single use" and the
-- outstanding-invite cap enforceable rather than advisory.
drop policy if exists "coach_invites: trainer can read own" on public.coach_invites;
create policy "coach_invites: trainer can read own" on public.coach_invites
  for select using (auth.uid() = trainer_id);

-- 8 chars from an alphabet with no 0/O/1/I. Each char comes from the first
-- byte of a fresh gen_random_uuid() (cryptographically random) mod 32 —
-- 256 is a multiple of 32, so there's no modulo bias.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..8 loop
    result := result || substr(alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_coach_invite(p_label text default null, p_days int default 7)
returns public.coach_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.coach_invites;
  v_days int := least(greatest(coalesce(p_days, 7), 1), 30);
  v_label text := nullif(left(trim(coalesce(p_label, '')), 60), '');
  v_outstanding int;
begin
  if auth.uid() is null or not public.has_coach_pass(auth.uid()) then
    raise exception 'A Coach Pass is required to invite clients';
  end if;

  select count(*) into v_outstanding from public.coach_invites
  where trainer_id = auth.uid() and redeemed_at is null and revoked_at is null and expires_at > now();
  if v_outstanding >= 25 then
    raise exception 'You have 25 open invites — revoke some before creating more';
  end if;

  -- The unique index makes a code collision an error rather than a silent
  -- duplicate; retry a few times with a fresh code before giving up.
  for attempt in 1..5 loop
    begin
      insert into public.coach_invites (trainer_id, code, label, expires_at)
      values (auth.uid(), public.generate_invite_code(), v_label, now() + make_interval(days => v_days))
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
end;
$$;
revoke all on function public.create_coach_invite(text, int) from public, anon;
grant execute on function public.create_coach_invite(text, int) to authenticated;

create or replace function public.revoke_coach_invite(p_invite_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_invites set revoked_at = now()
  where id = p_invite_id and trainer_id = auth.uid() and redeemed_at is null and revoked_at is null;
$$;
revoke all on function public.revoke_coach_invite(uuid) from public, anon;
grant execute on function public.revoke_coach_invite(uuid) to authenticated;

-- ── redeem_coach_invite_code (replaces the earlier version) ─────────────────
-- Now creates a *pending* link — the client has to accept it (see
-- respond_to_coach_link) before the trainer can see anything. Accepts a
-- per-client invite (single-use, expiring) or, for compatibility, the old
-- permanent per-trainer code. An already-active or already-pending link is
-- left alone and doesn't burn the invite; a previously revoked one goes back
-- to pending, since the client has just been invited again.
create or replace function public.redeem_coach_invite_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_trainer_id uuid;
  v_invite public.coach_invites;
  v_status text;
  v_changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if length(v_code) = 0 then
    raise exception 'Enter an invite code';
  end if;

  select * into v_invite from public.coach_invites where code = v_code for update;
  if found then
    if v_invite.revoked_at is not null or v_invite.redeemed_at is not null
       or v_invite.expires_at <= now() or not public.has_coach_pass(v_invite.trainer_id) then
      raise exception 'That invite code is invalid or no longer active';
    end if;
    v_trainer_id := v_invite.trainer_id;
  else
    select id into v_trainer_id from public.profiles where coach_invite_code = v_code;
    if v_trainer_id is null or not public.has_coach_pass(v_trainer_id) then
      raise exception 'That invite code is invalid or no longer active';
    end if;
  end if;

  if v_trainer_id = auth.uid() then
    raise exception 'You can''t connect to your own coach account';
  end if;

  select status into v_status from public.trainer_clients
  where trainer_id = v_trainer_id and client_id = auth.uid();

  if v_status is null then
    insert into public.trainer_clients (trainer_id, client_id, status)
    values (v_trainer_id, auth.uid(), 'pending');
    v_changed := true;
  elsif v_status = 'revoked' then
    update public.trainer_clients set status = 'pending', consented_at = null
    where trainer_id = v_trainer_id and client_id = auth.uid();
    v_changed := true;
  end if;

  if v_changed and v_invite.id is not null then
    update public.coach_invites set redeemed_by = auth.uid(), redeemed_at = now() where id = v_invite.id;
  end if;

  return v_trainer_id;
end;
$$;
revoke all on function public.redeem_coach_invite_code(text) from public, anon;
grant execute on function public.redeem_coach_invite_code(text) to authenticated;

-- ── respond_to_coach_link ───────────────────────────────────────────────────
-- The client's side of consent. Accept: pending -> active (stamping
-- consented_at), or — for links that predate the consent step — just record
-- that they've seen and confirmed what their coach can access. Decline /
-- disconnect: -> revoked.
create or replace function public.respond_to_coach_link(p_link_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.trainer_clients;
begin
  select * into v_link from public.trainer_clients
  where id = p_link_id and client_id = auth.uid() for update;
  if not found then
    raise exception 'Invitation not found';
  end if;

  if p_accept then
    if v_link.status = 'pending' then
      update public.trainer_clients set status = 'active', consented_at = now() where id = p_link_id;
    elsif v_link.status = 'active' and v_link.consented_at is null then
      update public.trainer_clients set consented_at = now() where id = p_link_id;
    else
      raise exception 'This invitation is no longer available';
    end if;
  else
    update public.trainer_clients set status = 'revoked' where id = p_link_id and status <> 'revoked';
  end if;
end;
$$;
revoke all on function public.respond_to_coach_link(uuid, boolean) from public, anon;
grant execute on function public.respond_to_coach_link(uuid, boolean) to authenticated;

-- ── get_pending_clients ─────────────────────────────────────────────────────
-- Lets a trainer see "Sam accepted the code, awaiting their OK" without
-- opening any read access: it returns a first name and a date, nothing
-- from the client's profile or logs.
create or replace function public.get_pending_clients()
returns table (link_id uuid, client_name text, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select tc.id,
         coalesce(nullif(split_part(trim(coalesce(p.name, '')), ' ', 1), ''), 'A client'),
         tc.created_at
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.client_id
  where tc.trainer_id = auth.uid() and tc.status = 'pending'
  order by tc.created_at desc;
$$;
revoke all on function public.get_pending_clients() from public, anon;
grant execute on function public.get_pending_clients() to authenticated;

-- ── get_my_coach_links ──────────────────────────────────────────────────────
-- A client's view of the trainers they're linked to, pending or active. The
-- existing "profiles: select own trainer" policy only opens a trainer's
-- profile to *active* clients (and hands over every column), so a pending
-- invitation couldn't even show who it's from. This returns just the two
-- fields the UI needs — name and logo — without widening that policy.
create or replace function public.get_my_coach_links()
returns table (
  id uuid, status text, created_at timestamptz, consented_at timestamptz,
  trainer_id uuid, trainer_name text, trainer_logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select tc.id, tc.status, tc.created_at, tc.consented_at, tc.trainer_id, p.name, p.coach_logo_url
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.trainer_id
  where tc.client_id = auth.uid() and tc.status in ('pending', 'active')
  order by tc.created_at desc;
$$;
revoke all on function public.get_my_coach_links() from public, anon;
grant execute on function public.get_my_coach_links() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Coach tools: private notes, workout access, client summaries, alert prefs
-- (schema update — run against an existing DB; safe to re-run).
-- Tests: supabase/tests/coach-tools.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- ── trainer_notes ───────────────────────────────────────────────────────────
-- A trainer's private notes about a client ("mentioned a knee injury").
-- Deliberately a separate table from trainer_comments rather than a flag on
-- it: there is no policy that lets a client (or any other trainer) read this
-- table at all, so a note can't leak to the client through a query that
-- forgot to filter on a flag. Notes outlive the connection — a trainer keeps
-- their own records after a client disconnects — but new ones need an active
-- link.
create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  note_date date,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trainer_notes_client_idx on public.trainer_notes (trainer_id, client_id, created_at desc);

alter table public.trainer_notes enable row level security;

drop policy if exists "trainer_notes: select own" on public.trainer_notes;
create policy "trainer_notes: select own" on public.trainer_notes
  for select using (auth.uid() = trainer_id);
drop policy if exists "trainer_notes: insert for active client" on public.trainer_notes;
create policy "trainer_notes: insert for active client" on public.trainer_notes
  for insert with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.client_id = trainer_notes.client_id and tc.status = 'active'
    )
  );
drop policy if exists "trainer_notes: update own" on public.trainer_notes;
create policy "trainer_notes: update own" on public.trainer_notes
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "trainer_notes: delete own" on public.trainer_notes;
create policy "trainer_notes: delete own" on public.trainer_notes
  for delete using (auth.uid() = trainer_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_trainer_notes_link_trigger on public.trainer_notes;
create trigger protect_trainer_notes_link_trigger
  before update on public.trainer_notes
  for each row
  execute function public.protect_trainer_link_columns();
drop trigger if exists touch_trainer_notes_trigger on public.trainer_notes;
create trigger touch_trainer_notes_trigger
  before update on public.trainer_notes
  for each row
  execute function public.touch_updated_at();

-- ── trainers can read a connected client's workouts ─────────────────────────
-- Same shape as the food/weight/check-in policies above. The consent screen
-- (src/lib/coachAccess.js) lists workouts alongside them.
drop policy if exists "workout_logs: select as trainer of client" on public.workout_logs;
create policy "workout_logs: select as trainer of client" on public.workout_logs
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = workout_logs.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );

-- ── get_client_summaries ────────────────────────────────────────────────────
-- One row per active client with the numbers a trainer scans to decide who
-- needs attention today — replacing the client list firing a separate
-- 7-day history query per client. SECURITY INVOKER: it runs as the trainer,
-- so the same RLS that guards direct reads decides what each subquery can
-- see; there is no way for this function to return a client the trainer
-- couldn't already read. p_today is the trainer's local date (food_logs
-- dates are each client's local date, so UTC "today" would be off by a day
-- for anyone far from it).
drop function if exists public.get_client_summaries(date);
create function public.get_client_summaries(p_today date default current_date)
returns table (
  link_id uuid, client_id uuid, client_name text, group_label text, connected_at timestamptz,
  goal text, calorie_target int, protein_g int,
  last_log_date date, days_logged_7d int, days_on_target_7d int, days_protein_7d int,
  avg_cal_7d numeric, today_cal numeric,
  latest_weight_kg numeric, latest_weight_date date, weight_change_kg_14d numeric,
  last_checkin_date date
)
language sql
stable
set search_path = public
as $$
  select
    tc.id, tc.client_id, p.name, tc.group_label, tc.created_at,
    p.goal, p.calorie_target, p.protein_g,
    (select max(f.logged_date) from public.food_logs f where f.user_id = tc.client_id),
    coalesce(d.days_logged, 0)::int,
    coalesce(d.days_on_target, 0)::int,
    coalesce(d.days_protein, 0)::int,
    d.avg_cal,
    coalesce(t.cal, 0),
    w.kg, w.dt,
    case when w.kg is not null and w0.kg is not null and w0.dt < w.dt then round(w.kg - w0.kg, 2) end,
    (select max(c.checkin_date) from public.checkins c where c.user_id = tc.client_id)
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.client_id
  left join lateral (
    select
      count(*) filter (where s.cal > 0) as days_logged,
      count(*) filter (where s.cal > 0 and p.calorie_target is not null
                       and s.cal between p.calorie_target * 0.85 and p.calorie_target * 1.15) as days_on_target,
      count(*) filter (where s.cal > 0 and p.protein_g is not null and s.prot >= p.protein_g * 0.9) as days_protein,
      avg(s.cal) filter (where s.cal > 0) as avg_cal
    from (
      select f.logged_date, sum(f.calories) as cal, sum(f.protein_g) as prot
      from public.food_logs f
      where f.user_id = tc.client_id and f.logged_date > p_today - 7 and f.logged_date <= p_today
      group by f.logged_date
    ) s
  ) d on true
  left join lateral (
    select sum(f.calories) as cal from public.food_logs f
    where f.user_id = tc.client_id and f.logged_date = p_today
  ) t on true
  left join lateral (
    select case when wl.unit = 'lb' then wl.weight * 0.45359237 else wl.weight end as kg, wl.logged_date as dt
    from public.weight_logs wl where wl.user_id = tc.client_id and wl.logged_date <= p_today
    order by wl.logged_date desc limit 1
  ) w on true
  left join lateral (
    select case when wl.unit = 'lb' then wl.weight * 0.45359237 else wl.weight end as kg, wl.logged_date as dt
    from public.weight_logs wl
    where wl.user_id = tc.client_id and w.dt is not null and wl.logged_date >= w.dt - 14 and wl.logged_date <= w.dt
    order by wl.logged_date asc limit 1
  ) w0 on true
  where tc.trainer_id = auth.uid() and tc.status = 'active'
  order by p.name nulls last;
$$;
revoke all on function public.get_client_summaries(date) from public, anon;
grant execute on function public.get_client_summaries(date) to authenticated;

-- ── trainer alert preferences ───────────────────────────────────────────────
-- notify_client_activity: one opt-in covering "a client messaged you" and
-- the daily "clients who haven't logged" digest (api/send-reminders.js).
-- activity_alert_last_sent_date makes the digest at-most-once per local day.
alter table public.profiles add column if not exists notify_client_activity boolean not null default false;
alter table public.profiles add column if not exists activity_alert_last_sent_date date;

-- ── client_last_log_dates ───────────────────────────────────────────────────
-- For the inactivity digest, which runs as the service role: the newest
-- food-log date for each of a list of clients, in one query. Locked to the
-- service role — for anyone else it would be a way to probe when arbitrary
-- users last logged food.
create or replace function public.client_last_log_dates(p_client_ids uuid[])
returns table (user_id uuid, last_log_date date)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id, max(f.logged_date)
  from public.food_logs f
  where f.user_id = any(p_client_ids)
  group by f.user_id;
$$;
revoke all on function public.client_last_log_dates(uuid[]) from public, anon, authenticated;
grant execute on function public.client_last_log_dates(uuid[]) to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- Trainer-set nutrient targets (schema update — run against an existing DB;
-- safe to re-run). Tests: supabase/tests/coach-targets.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- The one place SQL knows which nutrients exist. Must list exactly the keys
-- in src/lib/microNutrients.js — supabase/tests/coach-targets.test.js fails
-- if the two drift, so adding a nutrient in JS can't silently leave a
-- trainer unable to set its target.
create or replace function public.micro_nutrient_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'fibre', 'sodium', 'sugar', 'saturatedFat', 'transFat', 'cholesterol', 'addedSugar', 'potassium',
    'vitaminD', 'calcium', 'iron', 'vitaminA', 'vitaminC', 'vitaminB12', 'folate', 'magnesium', 'zinc',
    'polyunsaturatedFat', 'monounsaturatedFat'
  ]::text[];
$$;

-- A trainer sets a connected client's per-nutrient targets, replacing the
-- whole map (a nutrient left out means "use the default guideline", the same
-- meaning profiles.micro_targets has everywhere else). SECURITY DEFINER for
-- the same reason as set_client_targets — profiles' own RLS only lets a user
-- write their own row — so it validates everything itself: an active link,
-- known nutrient keys, numeric values in a sane range. Blank/null entries are
-- dropped rather than stored.
create or replace function public.set_client_micro_targets(p_client_id uuid, p_targets jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v jsonb;
  n numeric;
  clean jsonb := '{}'::jsonb;
begin
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = auth.uid() and client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Not an active trainer for this client';
  end if;
  if p_targets is null or jsonb_typeof(p_targets) <> 'object' then
    raise exception 'Targets must be an object of nutrient to number';
  end if;

  for k, v in select key, value from jsonb_each(p_targets) loop
    if not (k = any (public.micro_nutrient_keys())) then
      raise exception 'Unknown nutrient: %', k;
    end if;
    if v is null or jsonb_typeof(v) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v) <> 'number' then
      raise exception 'Target for % must be a number', k;
    end if;
    n := (v #>> '{}')::numeric;
    if n < 0 or n > 100000 then
      raise exception 'Target for % is out of range', k;
    end if;
    clean := clean || jsonb_build_object(k, n);
  end loop;

  update public.profiles set micro_targets = clean, updated_at = now() where id = p_client_id;
end;
$$;
revoke all on function public.set_client_micro_targets(uuid, jsonb) from public, anon;
grant execute on function public.set_client_micro_targets(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Start the free trial server-side (schema update — run against an existing
-- DB; safe to re-run). Tests: supabase/tests/free-trial.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- protect_privileged_profile_columns (above) reverts any client write to
-- trial_ends_at, which is what stops a user granting themselves a trial. But
-- onboarding/Step4 used to start the trial with exactly such a write — and by
-- then the profile row already exists, so it became an UPDATE that the
-- trigger silently reverted: no new signup got their 30 days. The trial now
-- starts through start_free_trial(), which picks the date itself (the caller
-- can't choose it), only ever sets it once, and only for accounts created
-- since the trial launched that have attached an email.

-- Same protections as before; the only change is that trial_ends_at may be
-- set from null by start_free_trial() below, which flags its own transaction.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_premium := old.is_premium;
    new.coach_pass := old.coach_pass;
    new.coach_mode := old.coach_mode;
    new.coach_pass_status := old.coach_pass_status;
    new.pro_status := old.pro_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stripe_pro_subscription_id := old.stripe_pro_subscription_id;
    if not (old.trial_ends_at is null and coalesce(current_setting('app.allow_trial_start', true), '') = 'on') then
      new.trial_ends_at := old.trial_ends_at;
    end if;
    new.photo_scans_used := old.photo_scans_used;
    new.photo_scans_period_start := old.photo_scans_period_start;
    new.menu_scans_used := old.menu_scans_used;
    new.menu_scans_period_start := old.menu_scans_period_start;
  end if;
  return new;
end;
$$;

create or replace function public.start_free_trial()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing timestamptz;
  acct record;
  ends timestamptz;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select trial_ends_at into existing from public.profiles where id = uid;
  if existing is not null then
    return existing;
  end if;

  select created_at, email, new_email into acct from auth.users where id = uid;
  -- New signups only: created since the trial launched (2026-09-18), and
  -- has attached real credentials (email is empty until confirmed, so
  -- new_email counts too).
  if acct.created_at is null or acct.created_at < timestamptz '2026-09-18 00:00:00+00' then
    return null;
  end if;
  if coalesce(acct.email, '') = '' and coalesce(acct.new_email, '') = '' then
    return null;
  end if;

  ends := now() + interval '30 days';
  perform set_config('app.allow_trial_start', 'on', true);
  update public.profiles set trial_ends_at = ends where id = uid and trial_ends_at is null;
  perform set_config('app.allow_trial_start', 'off', true);
  return ends;
end;
$$;

revoke all on function public.start_free_trial() from public, anon;
grant execute on function public.start_free_trial() to authenticated;
