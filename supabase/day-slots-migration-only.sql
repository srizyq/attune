-- ════════════════════════════════════════════════════════════════════════
-- Just the "Custom-named daily log slots" block (block 13 of 13 in
-- pending-migrations.sql). Paste this whole file — it's short enough that
-- select-all in the Supabase SQL editor should grab all of it in one go.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Custom-named daily log slots (schema update — new table + one column, run
-- once). Tests: src/lib/daySlots.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- Pro's third daily_log_view mode, alongside 'hourly' and 'meals' — a
-- user-defined timeline of named windows (e.g. "Morning Fuel" at 8:30am,
-- "Pre-Workout" at 4:15pm) instead of a fixed meal enum or literal clock
-- hours. Slots are per-day (not a shared template), so "copy day" and "paste
-- slot" (src/lib/db.js's copyDaySlots/pasteSlot) have real work to do — a
-- fresh day starts with none until copied or built up.
create table if not exists public.day_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  label text not null,
  slot_time time not null,
  sort_order int not null default 0,
  -- A slot's own macro budget, shown as "target balance" while it's still
  -- empty (src/components/SlotTimeline.jsx) — nulls mean "no target set for
  -- this macro", not zero.
  target_calories numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  created_at timestamptz default now()
);

create index if not exists day_slots_user_date_idx on public.day_slots (user_id, logged_date);

alter table public.day_slots enable row level security;

drop policy if exists "day_slots: select own" on public.day_slots;
create policy "day_slots: select own" on public.day_slots
  for select using (auth.uid() = user_id);
drop policy if exists "day_slots: insert own" on public.day_slots;
create policy "day_slots: insert own" on public.day_slots
  for insert with check (auth.uid() = user_id);
drop policy if exists "day_slots: update own" on public.day_slots;
create policy "day_slots: update own" on public.day_slots
  for update using (auth.uid() = user_id);
drop policy if exists "day_slots: delete own" on public.day_slots;
create policy "day_slots: delete own" on public.day_slots
  for delete using (auth.uid() = user_id);

-- Nullable: only set for items logged against a Slots-mode day. "on delete
-- set null" rather than cascading a slot's deletion onto its items — a
-- deleted slot's food isn't silently destroyed, it just falls into
-- buildSlotTimeline's trailing "Unsorted" segment (src/lib/daySlots.js).
alter table public.food_logs add column if not exists slot_id uuid
  references public.day_slots (id) on delete set null;

create index if not exists food_logs_slot_idx on public.food_logs (slot_id);

alter table public.profiles drop constraint if exists profiles_daily_log_view_check;
alter table public.profiles add constraint profiles_daily_log_view_check
  check (daily_log_view in ('hourly', 'meals', 'slots'));
