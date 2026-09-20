-- ════════════════════════════════════════════════════════════════════════
-- Attune — pending SQL updates
--
-- Generated from supabase/schema.sql by scripts/build-migration-bundle.mjs —
-- do not edit by hand. Paste the whole file into the Supabase SQL editor and
-- run it once. Every block is safe to re-run, so it does no harm if some of
-- them were already applied. Nothing in the app breaks before you run it: each
-- feature hides itself until its block is in.
--
-- Blocks, in order:
--    1. Coach consent + per-client invites
--    2. Coach tools: private notes, workout access, client summaries, alert prefs
--    3. Trainer-set nutrient targets
--    4. Start the free trial server-side
--    5. Body measurements and progress photos
--    6. Weekly check-in forms
--    7. Meal plans
--    8. Extended micronutrients
--    9. Training-day / rest-day targets
--   10. Coach teams
--   11. Favourite foods: all nutrients
--
-- Then run the three supabase/ausnut_micronutrients_backfill_partNof3.sql files
-- (they fill in the food database for the "Extended micronutrients" block).
-- ════════════════════════════════════════════════════════════════════════

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
-- Dropped first because a later block ("Coach teams") gives it one more return
-- column, and CREATE OR REPLACE can't change a function's return type — so
-- re-running this whole file must not trip over the newer version. (The Coach
-- teams block, which comes later, recreates the newer one.)
drop function if exists public.get_my_coach_links();
create function public.get_my_coach_links()
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
    'polyunsaturatedFat', 'monounsaturatedFat',
    'thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'vitaminE', 'phosphorus', 'selenium', 'iodine',
    'omega3', 'omega6', 'alphaLinolenicAcid', 'caffeine', 'alcohol'
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

  select created_at, email, email_change into acct from auth.users where id = uid;
  -- New signups only: created since the trial launched (2026-09-18), and
  -- has attached real credentials (email is empty until confirmed, so the
  -- pending address in email_change counts too — the API's `new_email` is
  -- that same value; there is no such column on auth.users).
  if acct.created_at is null or acct.created_at < timestamptz '2026-09-18 00:00:00+00' then
    return null;
  end if;
  if coalesce(acct.email, '') = '' and coalesce(acct.email_change, '') = '' then
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


-- ═══════════════════════════════════════════════════════════════════════════
-- Body measurements and progress photos (schema update — run against an
-- existing DB; safe to re-run). Tests: supabase/tests/body-progress.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- ── body_measurements ───────────────────────────────────────────────────────
-- One value per kind per day (logging again the same day replaces it, like
-- weight_logs). Body fat is a percentage; every other kind is a length in
-- cm or inches, and the check below keeps the two from being mixed up.
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  kind text not null check (kind in ('waist', 'hips', 'chest', 'arm', 'thigh', 'body_fat')),
  value numeric not null check (value > 0 and value < 1000),
  unit text not null check (unit in ('cm', 'in', 'pct')),
  created_at timestamptz not null default now(),
  unique (user_id, logged_date, kind),
  check ((kind = 'body_fat') = (unit = 'pct')),
  check (kind <> 'body_fat' or value < 75)
);
create index if not exists body_measurements_user_idx on public.body_measurements (user_id, logged_date desc);
alter table public.body_measurements enable row level security;

drop policy if exists "body_measurements: select own" on public.body_measurements;
create policy "body_measurements: select own" on public.body_measurements for select using (auth.uid() = user_id);
drop policy if exists "body_measurements: insert own" on public.body_measurements;
create policy "body_measurements: insert own" on public.body_measurements for insert with check (auth.uid() = user_id);
drop policy if exists "body_measurements: update own" on public.body_measurements;
create policy "body_measurements: update own" on public.body_measurements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "body_measurements: delete own" on public.body_measurements;
create policy "body_measurements: delete own" on public.body_measurements for delete using (auth.uid() = user_id);
drop policy if exists "body_measurements: select as trainer of client" on public.body_measurements;
create policy "body_measurements: select as trainer of client" on public.body_measurements
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = body_measurements.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );

-- ── progress_photos ─────────────────────────────────────────────────────────
-- Metadata for a photo kept in the private 'progress-photos' bucket. `path`
-- must live in the owner's own folder (<user id>/…), so a row can never point
-- at someone else's file.
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_date date not null,
  path text not null unique,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (position(user_id::text || '/' in path) = 1)
);
create index if not exists progress_photos_user_idx on public.progress_photos (user_id, taken_date desc);
alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos: select own" on public.progress_photos;
create policy "progress_photos: select own" on public.progress_photos for select using (auth.uid() = user_id);
drop policy if exists "progress_photos: insert own" on public.progress_photos;
create policy "progress_photos: insert own" on public.progress_photos for insert with check (auth.uid() = user_id);
drop policy if exists "progress_photos: delete own" on public.progress_photos;
create policy "progress_photos: delete own" on public.progress_photos for delete using (auth.uid() = user_id);
drop policy if exists "progress_photos: select as trainer of client" on public.progress_photos;
create policy "progress_photos: select as trainer of client" on public.progress_photos
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = progress_photos.user_id and tc.trainer_id = auth.uid() and tc.status = 'active'
    )
  );

-- ── progress-photos storage bucket ──────────────────────────────────────────
-- PRIVATE (unlike coach-logos): the app only ever shows photos through
-- short-lived signed URLs, which Supabase only issues to someone the policies
-- below let read the object. Capped at 8 MB and images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "progress-photos: owner can upload" on storage.objects;
create policy "progress-photos: owner can upload" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress-photos: owner can read" on storage.objects;
create policy "progress-photos: owner can read" on storage.objects
  for select using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress-photos: owner can delete" on storage.objects;
create policy "progress-photos: owner can delete" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- A coach reads an *active* client's photos. Compared as text on purpose:
-- casting the folder name to uuid could raise on some unrelated object.
drop policy if exists "progress-photos: trainer can read client photos" on storage.objects;
create policy "progress-photos: trainer can read client photos" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.status = 'active'
        and tc.client_id::text = (storage.foldername(name))[1]
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Weekly check-in forms (schema update — run against an existing DB; safe to
-- re-run). Tests: supabase/tests/checkin-forms.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- The rules for a form's questions, in one place so the table constraint and
-- the app agree: 1–12 questions, each with a unique short id, a type (a 1–10
-- scale, free text, or yes/no) and a label. src/lib/checkinForms.js mirrors
-- this; its tests are the drift guard.
create or replace function public.valid_checkin_questions(q jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
  ids text[] := '{}';
  n int;
begin
  if q is null or jsonb_typeof(q) is distinct from 'array' then return false; end if;
  n := jsonb_array_length(q);
  if n < 1 or n > 12 then return false; end if;
  for item in select value from jsonb_array_elements(q) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if jsonb_typeof(item -> 'id') is distinct from 'string' or (item ->> 'id') !~ '^[a-z0-9_]{1,40}$' then return false; end if;
    if (item ->> 'id') = any (ids) then return false; end if;
    ids := ids || (item ->> 'id');
    if jsonb_typeof(item -> 'type') is distinct from 'string' or (item ->> 'type') not in ('scale', 'text', 'yesno') then return false; end if;
    if jsonb_typeof(item -> 'label') is distinct from 'string' or char_length(item ->> 'label') not between 1 and 200 then return false; end if;
  end loop;
  return true;
end;
$$;

-- A set of answers must answer every question, with the right kind of value
-- (scale: a whole number 1–10; yes/no: true/false; text: up to 2,000
-- characters, may be empty) and nothing extra.
create or replace function public.valid_checkin_answers(q jsonb, a jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
  val jsonb;
  seen int := 0;
begin
  if a is null or jsonb_typeof(a) is distinct from 'object' then return false; end if;
  for item in select value from jsonb_array_elements(q) loop
    if not (a ? (item ->> 'id')) then return false; end if;
    val := a -> (item ->> 'id');
    seen := seen + 1;
    case item ->> 'type'
      when 'scale' then
        if jsonb_typeof(val) is distinct from 'number' then return false; end if;
        if (val #>> '{}')::numeric <> trunc((val #>> '{}')::numeric) or (val #>> '{}')::numeric not between 1 and 10 then return false; end if;
      when 'yesno' then
        if jsonb_typeof(val) is distinct from 'boolean' then return false; end if;
      when 'text' then
        if jsonb_typeof(val) is distinct from 'string' or char_length(val #>> '{}') > 2000 then return false; end if;
      else
        return false;
    end case;
  end loop;
  return (select count(*) from jsonb_object_keys(a)) = seen;
end;
$$;

-- ── checkin_forms ───────────────────────────────────────────────────────────
-- One form per trainer/client pair, edited in place. A trainer can only make
-- one for an active client; the client can read (never change) the one
-- addressed to them while the link is active.
create table if not exists public.checkin_forms (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Weekly check-in' check (char_length(title) between 1 and 80),
  questions jsonb not null check (public.valid_checkin_questions(questions)),
  cadence_days int not null default 7 check (cadence_days between 1 and 60),
  is_active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, client_id)
);
alter table public.checkin_forms enable row level security;

drop policy if exists "checkin_forms: trainer select own" on public.checkin_forms;
create policy "checkin_forms: trainer select own" on public.checkin_forms for select using (auth.uid() = trainer_id);
drop policy if exists "checkin_forms: trainer insert for active client" on public.checkin_forms;
create policy "checkin_forms: trainer insert for active client" on public.checkin_forms
  for insert with check (
    auth.uid() = trainer_id
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.client_id = checkin_forms.client_id and tc.status = 'active')
  );
drop policy if exists "checkin_forms: trainer update own" on public.checkin_forms;
create policy "checkin_forms: trainer update own" on public.checkin_forms for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "checkin_forms: trainer delete own" on public.checkin_forms;
create policy "checkin_forms: trainer delete own" on public.checkin_forms for delete using (auth.uid() = trainer_id);
drop policy if exists "checkin_forms: client select addressed to them" on public.checkin_forms;
create policy "checkin_forms: client select addressed to them" on public.checkin_forms
  for select using (
    auth.uid() = client_id
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = checkin_forms.trainer_id and tc.client_id = auth.uid() and tc.status = 'active')
  );

drop trigger if exists protect_checkin_forms_link_trigger on public.checkin_forms;
create trigger protect_checkin_forms_link_trigger
  before update on public.checkin_forms
  for each row execute function public.protect_trainer_link_columns();
drop trigger if exists touch_checkin_forms_trigger on public.checkin_forms;
create trigger touch_checkin_forms_trigger
  before update on public.checkin_forms
  for each row execute function public.touch_updated_at();

-- ── checkin_responses ───────────────────────────────────────────────────────
-- Immutable once submitted. Each carries a snapshot of the questions it
-- answered, so editing the form later can't change what an old answer meant.
create table if not exists public.checkin_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.checkin_forms (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  questions_snapshot jsonb not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists checkin_responses_form_idx on public.checkin_responses (form_id, created_at desc);
alter table public.checkin_responses enable row level security;

-- The client supplies only form_id and answers; everything else comes from the
-- form, so a response can't be filed against the wrong coach or with made-up
-- questions. Runs before the row-level-security check, which then verifies the
-- filled-in trainer_id against an active link.
create or replace function public.prepare_checkin_response()
returns trigger
language plpgsql
as $$
declare
  f public.checkin_forms;
begin
  select * into f from public.checkin_forms where id = new.form_id;
  if not found or f.client_id is distinct from auth.uid() or not f.is_active then
    raise exception 'Check-in form not found';
  end if;
  if exists (
    select 1 from public.checkin_responses r
    where r.form_id = f.id and r.created_at > now() - interval '12 hours'
  ) then
    raise exception 'You''ve already submitted this check-in recently';
  end if;
  if not public.valid_checkin_answers(f.questions, new.answers) then
    raise exception 'Some answers are missing or invalid';
  end if;
  new.trainer_id := f.trainer_id;
  new.client_id := f.client_id;
  new.questions_snapshot := f.questions;
  return new;
end;
$$;

drop trigger if exists prepare_checkin_response_trigger on public.checkin_responses;
create trigger prepare_checkin_response_trigger
  before insert on public.checkin_responses
  for each row execute function public.prepare_checkin_response();

drop policy if exists "checkin_responses: client insert own" on public.checkin_responses;
create policy "checkin_responses: client insert own" on public.checkin_responses
  for insert with check (
    auth.uid() = client_id
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = checkin_responses.trainer_id and tc.client_id = auth.uid() and tc.status = 'active')
  );
drop policy if exists "checkin_responses: client select own" on public.checkin_responses;
create policy "checkin_responses: client select own" on public.checkin_responses for select using (auth.uid() = client_id);
drop policy if exists "checkin_responses: trainer select for active client" on public.checkin_responses;
create policy "checkin_responses: trainer select for active client" on public.checkin_responses
  for select using (
    auth.uid() = trainer_id
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.client_id = checkin_responses.client_id and tc.status = 'active')
  );
-- No update or delete policy: a submitted check-in is a record.


-- ═══════════════════════════════════════════════════════════════════════════
-- Meal plans (schema update — run against an existing DB; safe to re-run).
-- Tests: supabase/tests/meal-plans.test.js
-- ═══════════════════════════════════════════════════════════════════════════

-- The shape of a plan's content, checked in the database so a malformed or
-- oversized plan can never be stored: { mon..sun: { breakfast|lunch|dinner|
-- snacks: [ { name, label?, calories?, protein_g?, carbs_g?, fat_g? } ] } },
-- at most 20 items a meal, sensible number ranges, 200 KB overall.
-- src/lib/mealPlan.js mirrors this; its tests are the drift guard.
create or replace function public.valid_meal_plan_days(d jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  day_key text; day_val jsonb;
  meal_key text; meal_val jsonb;
  item jsonb;
  k text; v jsonb; n numeric; lim numeric;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return false; end if;
  if octet_length(d::text) > 200000 then return false; end if;
  for day_key, day_val in select key, value from jsonb_each(d) loop
    if day_key not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then return false; end if;
    if jsonb_typeof(day_val) is distinct from 'object' then return false; end if;
    for meal_key, meal_val in select key, value from jsonb_each(day_val) loop
      if meal_key not in ('breakfast', 'lunch', 'dinner', 'snacks') then return false; end if;
      if jsonb_typeof(meal_val) is distinct from 'array' or jsonb_array_length(meal_val) > 20 then return false; end if;
      for item in select value from jsonb_array_elements(meal_val) loop
        if jsonb_typeof(item) is distinct from 'object' then return false; end if;
        if jsonb_typeof(item -> 'name') is distinct from 'string' or char_length(item ->> 'name') not between 1 and 120 then return false; end if;
        for k, v in select key, value from jsonb_each(item) loop
          if k = 'name' then
            continue;
          elsif k = 'label' then
            if jsonb_typeof(v) is distinct from 'string' or char_length(v #>> '{}') > 60 then return false; end if;
          elsif k in ('calories', 'protein_g', 'carbs_g', 'fat_g') then
            if jsonb_typeof(v) is distinct from 'number' then return false; end if;
            n := (v #>> '{}')::numeric;
            -- (a variable, not an inline CASE: plpgsql's IF..THEN parser would
            -- stop at the CASE's own THEN.)
            lim := case when k = 'calories' then 5000 else 1000 end;
            if n < 0 or n > lim then return false; end if;
          else
            return false;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;

-- One plan per coach/client pair, edited in place; the client reads (never
-- changes) the active one while the link is active.
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Meal plan' check (char_length(name) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 2000),
  days jsonb not null default '{}'::jsonb check (public.valid_meal_plan_days(days)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, client_id)
);
alter table public.meal_plans enable row level security;

drop policy if exists "meal_plans: trainer select own" on public.meal_plans;
create policy "meal_plans: trainer select own" on public.meal_plans for select using (auth.uid() = trainer_id);
drop policy if exists "meal_plans: trainer insert for active client" on public.meal_plans;
create policy "meal_plans: trainer insert for active client" on public.meal_plans
  for insert with check (
    auth.uid() = trainer_id
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.client_id = meal_plans.client_id and tc.status = 'active')
  );
drop policy if exists "meal_plans: trainer update own" on public.meal_plans;
create policy "meal_plans: trainer update own" on public.meal_plans for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "meal_plans: trainer delete own" on public.meal_plans;
create policy "meal_plans: trainer delete own" on public.meal_plans for delete using (auth.uid() = trainer_id);
drop policy if exists "meal_plans: client select active plan" on public.meal_plans;
create policy "meal_plans: client select active plan" on public.meal_plans
  for select using (
    auth.uid() = client_id and is_active
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = meal_plans.trainer_id and tc.client_id = auth.uid() and tc.status = 'active')
  );

drop trigger if exists protect_meal_plans_link_trigger on public.meal_plans;
create trigger protect_meal_plans_link_trigger
  before update on public.meal_plans
  for each row execute function public.protect_trainer_link_columns();
drop trigger if exists touch_meal_plans_trigger on public.meal_plans;
create trigger touch_meal_plans_trigger
  before update on public.meal_plans
  for each row execute function public.touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- Extended micronutrients (schema update — run against an existing DB; safe
-- to re-run). Tests: supabase/tests/micronutrients.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- Thirteen more nutrients: B1, B2, B3, B6, E, phosphorus, selenium, iodine,
-- long-chain omega-3, omega-6, alpha-linolenic acid, caffeine and alcohol.
-- Only AUSNUT carries them, so on food_logs they are NULLABLE with no default:
-- NULL means "this food's source didn't say", which must never be counted as
-- zero. (The older nutrient columns keep their default 0.)
alter table public.food_logs add column if not exists thiamin_mg numeric;
alter table public.food_logs add column if not exists riboflavin_mg numeric;
alter table public.food_logs add column if not exists niacin_mg numeric;
alter table public.food_logs add column if not exists vitamin_b6_mg numeric;
alter table public.food_logs add column if not exists vitamin_e_mg numeric;
alter table public.food_logs add column if not exists phosphorus_mg numeric;
alter table public.food_logs add column if not exists selenium_mcg numeric;
alter table public.food_logs add column if not exists iodine_mcg numeric;
alter table public.food_logs add column if not exists omega3_mg numeric;
alter table public.food_logs add column if not exists omega6_g numeric;
alter table public.food_logs add column if not exists ala_g numeric;
alter table public.food_logs add column if not exists caffeine_mg numeric;
alter table public.food_logs add column if not exists alcohol_g numeric;

-- ausnut_foods gets the same thirteen (NULL until the backfill in
-- supabase/ausnut_micronutrients_backfill.sql is run), plus eight nutrients the
-- app already tracks but this table never carried — so AUSNUT foods logged
-- calcium, iron, potassium, saturated/trans fat, cholesterol, added sugar and
-- vitamin D as 0 even though the source measures them. Those eight keep the
-- default 0 like their siblings.
alter table public.ausnut_foods add column if not exists thiamin_mg numeric;
alter table public.ausnut_foods add column if not exists riboflavin_mg numeric;
alter table public.ausnut_foods add column if not exists niacin_mg numeric;
alter table public.ausnut_foods add column if not exists vitamin_b6_mg numeric;
alter table public.ausnut_foods add column if not exists vitamin_e_mg numeric;
alter table public.ausnut_foods add column if not exists phosphorus_mg numeric;
alter table public.ausnut_foods add column if not exists selenium_mcg numeric;
alter table public.ausnut_foods add column if not exists iodine_mcg numeric;
alter table public.ausnut_foods add column if not exists omega3_mg numeric;
alter table public.ausnut_foods add column if not exists omega6_g numeric;
alter table public.ausnut_foods add column if not exists ala_g numeric;
alter table public.ausnut_foods add column if not exists caffeine_mg numeric;
alter table public.ausnut_foods add column if not exists alcohol_g numeric;
alter table public.ausnut_foods add column if not exists saturated_fat_g numeric default 0;
alter table public.ausnut_foods add column if not exists trans_fat_g numeric default 0;
alter table public.ausnut_foods add column if not exists cholesterol_mg numeric default 0;
alter table public.ausnut_foods add column if not exists potassium_mg numeric default 0;
alter table public.ausnut_foods add column if not exists added_sugar_g numeric default 0;
alter table public.ausnut_foods add column if not exists vitamin_d_mcg numeric default 0;
alter table public.ausnut_foods add column if not exists calcium_mg numeric default 0;
alter table public.ausnut_foods add column if not exists iron_mg numeric default 0;

-- The keys a trainer may set targets for (see the same function in the "Trainer-
-- set nutrient targets" block above; this is the current list).
create or replace function public.micro_nutrient_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'fibre', 'sodium', 'sugar', 'saturatedFat', 'transFat', 'cholesterol', 'addedSugar', 'potassium',
    'vitaminD', 'calcium', 'iron', 'vitaminA', 'vitaminC', 'vitaminB12', 'folate', 'magnesium', 'zinc',
    'polyunsaturatedFat', 'monounsaturatedFat',
    'thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'vitaminE', 'phosphorus', 'selenium', 'iodine',
    'omega3', 'omega6', 'alphaLinolenicAcid', 'caffeine', 'alcohol'
  ]::text[];
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Training-day / rest-day targets (schema update — run against an existing DB;
-- safe to re-run). Tests: supabase/tests/day-targets.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- A profile's calorie_target / protein_g / carbs_g / fat_g stay the everyday
-- (training-day) targets. rest_day_targets optionally overrides them on days
-- that are not training days; training_days lists the weekdays that are
-- (0 = Sunday .. 6 = Saturday, the same numbering as JavaScript's getDay and
-- Postgres's extract(dow ...)). The feature is only in effect when BOTH are
-- present — with rest_day_targets null, or no training days chosen, every day
-- uses the base targets exactly as before. A nutrient missing from
-- rest_day_targets falls back to its base target.
alter table public.profiles add column if not exists rest_day_targets jsonb;
alter table public.profiles add column if not exists training_days int[];

create or replace function public.valid_rest_day_targets(t jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  k text;
  v jsonb;
  lim numeric;
begin
  if t is null then return true; end if;
  if jsonb_typeof(t) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(t) loop
    if k not in ('calories', 'protein_g', 'carbs_g', 'fat_g') then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    -- Kept in a variable: an inline CASE inside IF ... THEN breaks PL/pgSQL's parser.
    lim := case when k = 'calories' then 20000 else 2000 end;
    if (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > lim then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.valid_training_days(d int[])
returns boolean
language sql
immutable
as $$
  select d is null or (
    cardinality(d) <= 7
    and not exists (select 1 from unnest(d) x where x is null or x < 0 or x > 6)
    and (select count(distinct x) = cardinality(d) from unnest(d) x)
  );
$$;

alter table public.profiles drop constraint if exists profiles_rest_day_targets_valid;
alter table public.profiles add constraint profiles_rest_day_targets_valid
  check (public.valid_rest_day_targets(rest_day_targets));
alter table public.profiles drop constraint if exists profiles_training_days_valid;
alter table public.profiles add constraint profiles_training_days_valid
  check (public.valid_training_days(training_days));

-- The target that applies on one date. p_key is calories | protein_g | carbs_g
-- | fat_g. src/lib/dayTargets.js (targetsForDate) mirrors this; the tests
-- compare the two.
create or replace function public.target_for_date(p_base numeric, p_rest jsonb, p_key text, p_training int[], p_date date)
returns numeric
language sql
immutable
as $$
  select case
    when p_rest is null or coalesce(cardinality(p_training), 0) = 0 then p_base
    when extract(dow from p_date)::int = any (p_training) then p_base
    else coalesce((p_rest ->> p_key)::numeric, p_base)
  end;
$$;

-- A trainer sets a connected client's rest-day targets and training weekdays,
-- replacing both (null / empty clears the feature). SECURITY DEFINER for the
-- same reason as set_client_targets, so it validates everything itself.
-- Setting rest-day targets also switches the client to custom calorie mode:
-- an adaptive target rewrites the base numbers on its own, which would leave
-- the two sets out of step.
create or replace function public.set_client_day_targets(p_client_id uuid, p_rest jsonb, p_training_days int[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean jsonb := null;
  days int[] := null;
  k text;
  v jsonb;
begin
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = auth.uid() and client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Not an active trainer for this client';
  end if;

  if p_rest is not null and jsonb_typeof(p_rest) <> 'null' then
    if jsonb_typeof(p_rest) <> 'object' then raise exception 'Rest-day targets must be an object'; end if;
    clean := '{}'::jsonb;
    for k, v in select * from jsonb_each(p_rest) loop
      if jsonb_typeof(v) = 'null' then continue; end if;
      if k not in ('calories', 'protein_g', 'carbs_g', 'fat_g') then raise exception 'Unknown target: %', k; end if;
      if jsonb_typeof(v) <> 'number' then raise exception 'Target % must be a number', k; end if;
      clean := clean || jsonb_build_object(k, v);
    end loop;
    if clean = '{}'::jsonb then clean := null; end if;
    if not public.valid_rest_day_targets(clean) then raise exception 'A rest-day target is out of range'; end if;
  end if;

  if p_training_days is not null and cardinality(p_training_days) > 0 then
    if not public.valid_training_days(p_training_days) then raise exception 'Training days must be distinct weekdays 0-6'; end if;
    select array_agg(x order by x) into days from unnest(p_training_days) x;
  end if;

  update public.profiles
  set rest_day_targets = clean,
      training_days = days,
      calorie_mode = case when clean is not null then 'custom' else calorie_mode end,
      updated_at = now()
  where id = p_client_id;
end;
$$;

revoke all on function public.set_client_day_targets(uuid, jsonb, int[]) from public, anon;
grant execute on function public.set_client_day_targets(uuid, jsonb, int[]) to authenticated;

-- get_client_summaries again, now day-aware: calorie_target / protein_g are the
-- targets for p_today, and days_on_target_7d / days_protein_7d judge each day
-- against that day's own target. With no rest-day targets set the numbers are
-- identical to before.
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
    p.goal,
    public.target_for_date(p.calorie_target, p.rest_day_targets, 'calories', p.training_days, p_today)::int,
    public.target_for_date(p.protein_g, p.rest_day_targets, 'protein_g', p.training_days, p_today)::int,
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
      count(*) filter (where s.cal > 0 and s.cal_target is not null
                       and s.cal between s.cal_target * 0.85 and s.cal_target * 1.15) as days_on_target,
      count(*) filter (where s.cal > 0 and s.prot_target is not null and s.prot >= s.prot_target * 0.9) as days_protein,
      avg(s.cal) filter (where s.cal > 0) as avg_cal
    from (
      select f.logged_date, sum(f.calories) as cal, sum(f.protein_g) as prot,
             public.target_for_date(p.calorie_target, p.rest_day_targets, 'calories', p.training_days, f.logged_date) as cal_target,
             public.target_for_date(p.protein_g, p.rest_day_targets, 'protein_g', p.training_days, f.logged_date) as prot_target
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


-- ═══════════════════════════════════════════════════════════════════════════
-- Coach teams (schema update — run against an existing DB; safe to re-run).
-- Tests: supabase/tests/coach-teams.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- A team is a named group of practitioners (a clinic, a gym's coaching staff).
-- Every member keeps their OWN Coach Pass — teams change nothing about billing.
--
-- Deliberately, a team does NOT open anyone's clients to their teammates: a
-- client agreed to be coached by one person, not that person's colleagues.
-- What a team gives is (1) a roster of who is on the team and how many clients
-- each coaches (a count, never names), and (2) a way to bring a teammate in on
-- a client — share_client_with_teammate — which creates an ordinary *pending*
-- link that the client must accept, exactly like an invite code. Until they do,
-- the teammate can see nothing (every trainer read policy needs status active).
--
-- The three tables have RLS on and no policies: they are reached only through
-- the functions below, which is what makes "owner only", the size cap and
-- "single-use invite" enforceable rather than advisory.
create table if not exists public.coach_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- user_id is the primary key: a practitioner is on at most one team.
create table if not exists public.coach_team_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  team_id uuid not null references public.coach_teams (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now()
);
create index if not exists coach_team_members_team_idx on public.coach_team_members (team_id);
create table if not exists public.coach_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.coach_teams (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coach_team_invites_team_idx on public.coach_team_invites (team_id, created_at desc);

alter table public.coach_teams enable row level security;
alter table public.coach_team_members enable row level security;
alter table public.coach_team_invites enable row level security;

-- Who suggested a link (set when a coach brings in a teammate), so the client
-- can be told "Riley was suggested by Jordan" when asked to accept.
alter table public.trainer_clients add column if not exists referred_by uuid references public.profiles (id) on delete set null;

create or replace function public.create_coach_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_id uuid;
begin
  if auth.uid() is null or not public.has_coach_pass(auth.uid()) then
    raise exception 'A Coach Pass is required to create a team';
  end if;
  if v_name = '' then raise exception 'Give the team a name'; end if;
  if exists (select 1 from public.coach_team_members where user_id = auth.uid()) then
    raise exception 'You are already in a team';
  end if;
  insert into public.coach_teams (name, owner_id) values (v_name, auth.uid()) returning id into v_id;
  insert into public.coach_team_members (user_id, team_id, role) values (auth.uid(), v_id, 'owner');
  return v_id;
end;
$$;
revoke all on function public.create_coach_team(text) from public, anon;
grant execute on function public.create_coach_team(text) to authenticated;

-- The caller's team as one JSON document, or null when they aren't in one:
-- { id, name, is_owner, max_members, members: [{ user_id, name, role,
-- joined_at, client_count, has_pass }], invites: [{ id, code, expires_at }] }.
-- client_count is a number only. invites are visible to the owner alone.
create or replace function public.get_my_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team public.coach_teams;
  v_role text;
begin
  select m.role into v_role from public.coach_team_members m where m.user_id = auth.uid();
  if not found then return null; end if;
  select t.* into v_team
  from public.coach_teams t join public.coach_team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'is_owner', v_role = 'owner',
    'max_members', 25,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'name', coalesce(nullif(trim(p.name), ''), 'Coach'),
        'role', m.role,
        'joined_at', m.joined_at,
        'client_count', (select count(*) from public.trainer_clients tc where tc.trainer_id = m.user_id and tc.status = 'active'),
        'has_pass', public.has_coach_pass(m.user_id)
      ) order by (m.role = 'owner') desc, m.joined_at, m.user_id), '[]'::jsonb)
      from public.coach_team_members m join public.profiles p on p.id = m.user_id
      where m.team_id = v_team.id
    ),
    'invites', case when v_role = 'owner' then (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'expires_at', i.expires_at) order by i.created_at desc), '[]'::jsonb)
      from public.coach_team_invites i
      where i.team_id = v_team.id and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()
    ) else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.get_my_team() from public, anon;
grant execute on function public.get_my_team() to authenticated;

create or replace function public.create_team_invite(p_days int default 7)
returns public.coach_team_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_row public.coach_team_invites;
  v_days int := least(greatest(coalesce(p_days, 7), 1), 30);
begin
  select team_id into v_team_id from public.coach_team_members where user_id = auth.uid() and role = 'owner';
  if v_team_id is null then raise exception 'Only the team owner can invite people'; end if;
  if (select count(*) from public.coach_team_invites
      where team_id = v_team_id and redeemed_at is null and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'You have 10 open invites — revoke some before creating more';
  end if;
  for attempt in 1..5 loop
    begin
      insert into public.coach_team_invites (team_id, code, created_by, expires_at)
      values (v_team_id, public.generate_invite_code(), auth.uid(), now() + make_interval(days => v_days))
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
end;
$$;
revoke all on function public.create_team_invite(int) from public, anon;
grant execute on function public.create_team_invite(int) to authenticated;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_team_invites set revoked_at = now()
  where id = p_invite_id and redeemed_at is null and revoked_at is null
    and team_id in (select team_id from public.coach_team_members where user_id = auth.uid() and role = 'owner');
$$;
revoke all on function public.revoke_team_invite(uuid) from public, anon;
grant execute on function public.revoke_team_invite(uuid) to authenticated;

-- Joins the team an invite code belongs to. The caller needs their own Coach
-- Pass and must not already be on a team. The invite is single use.
create or replace function public.redeem_team_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_invite public.coach_team_invites;
begin
  if auth.uid() is null or not public.has_coach_pass(auth.uid()) then
    raise exception 'A Coach Pass is required to join a team';
  end if;
  if v_code = '' then raise exception 'Enter an invite code'; end if;
  if exists (select 1 from public.coach_team_members where user_id = auth.uid()) then
    raise exception 'You are already in a team';
  end if;
  select * into v_invite from public.coach_team_invites where code = v_code for update;
  if not found or v_invite.revoked_at is not null or v_invite.redeemed_at is not null or v_invite.expires_at <= now() then
    raise exception 'That invite code is invalid or no longer active';
  end if;
  if (select count(*) from public.coach_team_members where team_id = v_invite.team_id) >= 25 then
    raise exception 'That team is full';
  end if;
  insert into public.coach_team_members (user_id, team_id, role) values (auth.uid(), v_invite.team_id, 'member');
  update public.coach_team_invites set redeemed_by = auth.uid(), redeemed_at = now() where id = v_invite.id;
  return v_invite.team_id;
end;
$$;
revoke all on function public.redeem_team_invite(text) from public, anon;
grant execute on function public.redeem_team_invite(text) to authenticated;

-- A member leaves. The owner can't (the team would be left without one): they
-- remove the team instead. Leaving never touches anyone's coaching links.
create or replace function public.leave_coach_team()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.coach_team_members where user_id = auth.uid();
  if v_role is null then raise exception 'You are not in a team'; end if;
  if v_role = 'owner' then raise exception 'The owner can''t leave — remove the team instead'; end if;
  delete from public.coach_team_members where user_id = auth.uid();
end;
$$;
revoke all on function public.leave_coach_team() from public, anon;
grant execute on function public.leave_coach_team() to authenticated;

create or replace function public.remove_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.coach_team_members where user_id = auth.uid() and role = 'owner';
  if v_team_id is null then raise exception 'Only the team owner can remove people'; end if;
  if p_user_id = auth.uid() then raise exception 'You can''t remove yourself — remove the team instead'; end if;
  delete from public.coach_team_members where user_id = p_user_id and team_id = v_team_id;
  if not found then raise exception 'That person is not on your team'; end if;
end;
$$;
revoke all on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- Deletes the team (members and invites go with it). Coaching links are
-- untouched: each is between a coach and a client, not the team.
create or replace function public.delete_coach_team()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.coach_teams where owner_id = auth.uid();
  if not found then raise exception 'Only the team owner can remove the team'; end if;
end;
$$;
revoke all on function public.delete_coach_team() from public, anon;
grant execute on function public.delete_coach_team() to authenticated;

-- Brings a teammate in on one of your clients. Creates an ordinary PENDING
-- link for the teammate, which the client must accept before the teammate can
-- see anything. A client who has already ended things with that teammate is
-- not asked again — the coach doesn't get to re-pend a link the client closed.
create or replace function public.share_client_with_teammate(p_client_id uuid, p_teammate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_link uuid;
begin
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = auth.uid() and client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Not an active trainer for this client';
  end if;
  if p_teammate_id = auth.uid() then raise exception 'You already coach this client'; end if;
  if not exists (
    select 1 from public.coach_team_members a join public.coach_team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_teammate_id
  ) then
    raise exception 'That person isn''t on your team';
  end if;
  if not public.has_coach_pass(p_teammate_id) then
    raise exception 'That teammate needs a Coach Pass to take on a client';
  end if;
  select status into v_status from public.trainer_clients where trainer_id = p_teammate_id and client_id = p_client_id;
  if v_status = 'revoked' then
    raise exception 'This client has already ended coaching with that teammate';
  elsif v_status is not null then
    raise exception 'That teammate is already connected to this client or waiting for their reply';
  end if;
  insert into public.trainer_clients (trainer_id, client_id, status, referred_by)
  values (p_teammate_id, p_client_id, 'pending', auth.uid())
  returning id into v_link;
  return v_link;
end;
$$;
revoke all on function public.share_client_with_teammate(uuid, uuid) from public, anon;
grant execute on function public.share_client_with_teammate(uuid, uuid) to authenticated;

-- The other coaches on one of your clients who are on your team (pending or
-- active), so you can see "Riley is also coaching Sam". Coaches outside your
-- team are never listed.
create or replace function public.get_client_coaches(p_client_id uuid)
returns table (trainer_id uuid, trainer_name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select tc.trainer_id, coalesce(nullif(trim(p.name), ''), 'Coach'), tc.status
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.trainer_id
  where tc.client_id = p_client_id
    and tc.trainer_id <> auth.uid()
    and tc.status in ('pending', 'active')
    and exists (select 1 from public.trainer_clients me where me.trainer_id = auth.uid() and me.client_id = p_client_id and me.status = 'active')
    and exists (
      select 1 from public.coach_team_members a join public.coach_team_members b on a.team_id = b.team_id
      where a.user_id = auth.uid() and b.user_id = tc.trainer_id
    )
  order by tc.created_at;
$$;
revoke all on function public.get_client_coaches(uuid) from public, anon;
grant execute on function public.get_client_coaches(uuid) to authenticated;

-- get_my_coach_links again, now also saying who suggested the link, so a
-- client asked to accept a teammate sees who brought them in.
drop function if exists public.get_my_coach_links();
create function public.get_my_coach_links()
returns table (
  id uuid, status text, created_at timestamptz, consented_at timestamptz,
  trainer_id uuid, trainer_name text, trainer_logo_url text, referred_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select tc.id, tc.status, tc.created_at, tc.consented_at, tc.trainer_id, p.name, p.coach_logo_url,
         (select nullif(trim(r.name), '') from public.profiles r where r.id = tc.referred_by)
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.trainer_id
  where tc.client_id = auth.uid() and tc.status in ('pending', 'active')
  order by tc.created_at desc;
$$;
revoke all on function public.get_my_coach_links() from public, anon;
grant execute on function public.get_my_coach_links() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Favourite foods: all nutrients (schema update — run against an existing DB;
-- safe to re-run). Tests: supabase/tests/favourite-foods.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- favourite_foods was created with only the first eleven nutrients, so a
-- starred food lost its vitamins, minerals and fats the next time it was logged
-- from Favourites. This adds the rest. The eight older ones default to 0 like
-- their siblings; the thirteen extended ones (see "Extended micronutrients")
-- are NULL when the food's source didn't say — never 0.
alter table public.favourite_foods add column if not exists vitamin_a_mcg numeric default 0;
alter table public.favourite_foods add column if not exists vitamin_c_mg numeric default 0;
alter table public.favourite_foods add column if not exists vitamin_b12_mcg numeric default 0;
alter table public.favourite_foods add column if not exists folate_mcg numeric default 0;
alter table public.favourite_foods add column if not exists magnesium_mg numeric default 0;
alter table public.favourite_foods add column if not exists zinc_mg numeric default 0;
alter table public.favourite_foods add column if not exists polyunsaturated_fat_g numeric default 0;
alter table public.favourite_foods add column if not exists monounsaturated_fat_g numeric default 0;
alter table public.favourite_foods add column if not exists thiamin_mg numeric;
alter table public.favourite_foods add column if not exists riboflavin_mg numeric;
alter table public.favourite_foods add column if not exists niacin_mg numeric;
alter table public.favourite_foods add column if not exists vitamin_b6_mg numeric;
alter table public.favourite_foods add column if not exists vitamin_e_mg numeric;
alter table public.favourite_foods add column if not exists phosphorus_mg numeric;
alter table public.favourite_foods add column if not exists selenium_mcg numeric;
alter table public.favourite_foods add column if not exists iodine_mcg numeric;
alter table public.favourite_foods add column if not exists omega3_mg numeric;
alter table public.favourite_foods add column if not exists omega6_g numeric;
alter table public.favourite_foods add column if not exists ala_g numeric;
alter table public.favourite_foods add column if not exists caffeine_mg numeric;
alter table public.favourite_foods add column if not exists alcohol_g numeric;
