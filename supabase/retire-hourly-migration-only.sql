-- ════════════════════════════════════════════════════════════════════════
-- Just the "Retire the Hourly daily-log view" block (block 14 of 14 in
-- pending-migrations.sql). Paste this whole file — it's 13 lines, so
-- select-all should grab all of it in one go. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Retire the Hourly daily-log view (schema update — run once). Tests:
-- src/lib/daySlots.test.js
-- ═══════════════════════════════════════════════════════════════════════════
-- Hourly (fixed clock-hour buckets) is retired in favour of Slots (custom-
-- named, user-defined time windows — the feature it was replaced by).
-- Existing Hourly viewers move to Slots rather than being silently dropped
-- back to Meals, since Slots is the closer match to what they'd chosen.
update public.profiles set daily_log_view = 'slots' where daily_log_view = 'hourly';

alter table public.profiles drop constraint if exists profiles_daily_log_view_check;
alter table public.profiles add constraint profiles_daily_log_view_check
  check (daily_log_view in ('meals', 'slots'));
