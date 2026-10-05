// Triggered on a schedule by .github/workflows/send-reminders.yml (NOT
// vercel.json — Vercel Cron isn't available on the current plan; adding
// a crons entry there silently blocks every deployment, twice now — see
// that file's own comment before reintroducing one). Sends the "log your
// food" reminder push to any user whose local reminder time has passed
// today and who hasn't been notified yet today. Runs on a schedule rather
// than at the exact minute someone picked — "has today's reminder time
// already passed, and have we not sent one yet today" is deliberately
// tolerant of that, since a tight per-minute match would silently miss
// people between runs.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { digestDue, digestPayload, pickInactive, checkinPayload, pickDueForms, withinWakingHours } from './_coachPush.js';
import { pickFinishedFasts, fastEndPayload } from './_fastPush.js';

function localDateAndTime(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}


const INACTIVE_DAYS = 3;

// Once a morning (09:00 in the coach's own timezone), a single push telling a
// coach how many of their clients have gone quiet — the "who needs a nudge
// today" signal without opening the app. Opt-in via profiles.
// notify_client_activity. Marked sent *before* sending so a crash mid-run can
// only skip a day, never spam repeats. Runs inside this existing cron because
// the project is at Vercel's 12-function cap (no room for a second endpoint),
// and is fully isolated: any failure here is logged and must never affect the
// reminder pushes above.
async function runInactiveClientDigest(supabase) {
  const { data: trainers, error } = await supabase
    .from('profiles')
    .select('id, reminder_timezone, activity_alert_last_sent_date')
    .eq('notify_client_activity', true);
  // Before the coach-tools migration has been run these columns don't exist.
  if (error) return { checked: 0, sent: 0 };

  let sent = 0;
  for (const trainer of trainers || []) {
    const { date, time } = localDateAndTime(trainer.reminder_timezone);
    if (!digestDue(time, trainer.activity_alert_last_sent_date, date)) continue;

    await supabase.from('profiles').update({ activity_alert_last_sent_date: date }).eq('id', trainer.id);

    const { data: links } = await supabase
      .from('trainer_clients')
      .select('client_id, created_at')
      .eq('trainer_id', trainer.id)
      .eq('status', 'active');
    if (!links || links.length === 0) continue;

    const { data: lastRows } = await supabase.rpc('client_last_log_dates', { p_client_ids: links.map((l) => l.client_id) });
    const lastLogByClient = Object.fromEntries((lastRows || []).map((r) => [r.user_id, r.last_log_date]));
    const inactive = pickInactive(links, lastLogByClient, date, INACTIVE_DAYS);
    if (inactive.length === 0) continue;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, subscription')
      .eq('user_id', trainer.id);
    const payload = JSON.stringify(digestPayload(inactive.length, INACTIVE_DAYS));
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Digest push failed:', sub.endpoint, err.message);
        }
      }
    }
  }
  return { checked: (trainers || []).length, sent };
}

// Nudges a client when a coach's check-in form falls due. Same isolation as the
// digest above (it runs in this cron because the project is at Vercel's
// 12-function cap): failures are logged, never allowed to break the reminder
// pushes, and it does nothing at all before the check-in tables exist.
// Reuses the client's "Trainer updates" opt-in (notify_trainer_comments) and
// only sends between 08:00 and 21:00 in their own timezone when that's known.
// The form is stamped as notified *before* sending, so a crash can only skip a
// nudge, never repeat one.
async function runCheckinDueNudges(supabase, nowMs = Date.now()) {
  const { data: forms, error } = await supabase
    .from('checkin_forms')
    .select('id, client_id, trainer_id, cadence_days, created_at, last_notified_at')
    .eq('is_active', true);
  if (error || !forms || forms.length === 0) return { checked: 0, sent: 0 };

  const { data: responses } = await supabase
    .from('checkin_responses')
    .select('form_id, created_at')
    .in('form_id', forms.map((f) => f.id))
    .order('created_at', { ascending: false });
  const lastByForm = {};
  for (const r of responses || []) if (!lastByForm[r.form_id]) lastByForm[r.form_id] = r.created_at;

  let sent = 0;
  const due = pickDueForms(forms, lastByForm, nowMs);
  for (const form of due) {
    const { data: link } = await supabase
      .from('trainer_clients').select('id')
      .eq('trainer_id', form.trainer_id).eq('client_id', form.client_id).eq('status', 'active')
      .maybeSingle();
    if (!link) continue;

    const { data: client } = await supabase
      .from('profiles').select('notify_trainer_comments, reminder_timezone').eq('id', form.client_id).maybeSingle();
    if (!client?.notify_trainer_comments) continue;
    if (client.reminder_timezone && !withinWakingHours(localDateAndTime(client.reminder_timezone).time)) continue;

    await supabase.from('checkin_forms').update({ last_notified_at: new Date(nowMs).toISOString() }).eq('id', form.id);

    const { data: coach } = await supabase.from('profiles').select('name').eq('id', form.trainer_id).maybeSingle();
    const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, subscription').eq('user_id', form.client_id);
    const payload = JSON.stringify(checkinPayload(coach?.name));
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Check-in push failed:', sub.endpoint, err.message);
        }
      }
    }
  }
  return { checked: forms.length, sent };
}

// Nudges anyone still eligible for their one-time free month of Pro (never
// started a trial, not already premium) and not yet reminded about it. Same
// isolation as the digest/check-in functions above: runs inside this
// existing cron (project is at Vercel's 12-function cap), any failure here
// is logged and must never affect the reminder pushes above, and a user is
// stamped as reminded *before* sending so a crash can only skip the nudge,
// never repeat it. One-time by design, not a recurring nag — profiles.
// free_month_reminder_sent_at being non-null is what keeps this from
// re-selecting the same person on the next run.
async function runFreeMonthReminder(supabase) {
  const { data: candidates, error } = await supabase
    .from('profiles')
    .select('id')
    .is('trial_ends_at', null)
    .eq('is_premium', false)
    .is('free_month_reminder_sent_at', null);
  // Before the free-month-reminder migration has been run this column
  // doesn't exist yet.
  if (error) return { checked: 0, sent: 0 };

  let sent = 0;
  for (const profile of candidates || []) {
    await supabase.from('profiles').update({ free_month_reminder_sent_at: new Date().toISOString() }).eq('id', profile.id);

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, subscription')
      .eq('user_id', profile.id);
    if (!subs || subs.length === 0) continue;

    const payload = JSON.stringify({
      title: 'Attune',
      body: "You've got a free month of Pro waiting — unlimited AI scans, full micronutrient tracking, and more, on us for 30 days.",
      url: '/pricing',
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Free-month reminder push failed:', sub.endpoint, err.message);
        }
      }
    }
  }
  return { checked: (candidates || []).length, sent };
}

// Tells someone their fast has reached its goal. Same isolation as the other
// extras (runs inside this cron because the project is at Vercel's 12-function
// cap; failures are logged and never touch the reminder pushes), and a no-op
// before the fasting table exists. Opt-in via profiles.notify_fast_end. The
// fast is stamped as notified *before* sending, so a crash can only skip the
// nudge, never repeat it. A fast that finishes outside 08:00–21:00 in the
// person's own timezone is left unstamped and picked up on the first run after
// they'd plausibly be awake — unless they've ended it themselves by then. The
// cron only runs every ~15 minutes, so the push can land that much late.
async function runFastEndNudges(supabase, nowMs = Date.now()) {
  const { data: fasts, error } = await supabase
    .from('fasts')
    .select('id, user_id, target_hours, started_at, ended_at, end_notified_at')
    .is('ended_at', null)
    .is('end_notified_at', null);
  if (error || !fasts || fasts.length === 0) return { checked: 0, sent: 0 };

  let sent = 0;
  for (const fast of pickFinishedFasts(fasts, nowMs)) {
    const { data: profile } = await supabase
      .from('profiles').select('notify_fast_end, reminder_timezone').eq('id', fast.user_id).maybeSingle();
    if (!profile?.notify_fast_end) continue;
    if (profile.reminder_timezone && !withinWakingHours(localDateAndTime(profile.reminder_timezone).time)) continue;

    await supabase.from('fasts').update({ end_notified_at: new Date(nowMs).toISOString() }).eq('id', fast.id);

    const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, subscription').eq('user_id', fast.user_id);
    const payload = JSON.stringify(fastEndPayload(fast.target_hours));
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Fast-end push failed:', sub.endpoint, err.message);
        }
      }
    }
  }
  return { checked: fasts.length, sent };
}

export default async function handler(req, res) {
  // This is an action endpoint (it sends real pushes and mutates
  // notification-sent state), not content — a shared cache serving a
  // stale response here would let a plain request replay a previous
  // run's result without the secret at all. Confirmed this actually
  // happens on Vercel's edge by default: the very first request after
  // deploy got a `200` with real data despite carrying no auth header,
  // purely from CDN caching, before a cache-busted retry correctly hit
  // the function and got 401. no-store rules that out entirely.
  res.setHeader('Cache-Control', 'no-store');

  // This endpoint sends a real push to every eligible user and burns a
  // service-role Supabase connection — with no check here, its URL is
  // otherwise fully public (anyone who finds it could spam every user's
  // notifications on repeat, or run up billing). The GitHub Actions
  // workflow sends this header itself (its own CRON_SECRET repo secret,
  // which must match this same-named env var in Vercel) since it isn't
  // Vercel's own scheduler calling in — nothing sends it automatically
  // here the way Vercel Cron would. Keep both values in sync if either
  // is ever rotated.
  // Fail closed: a missing secret must not leave the endpoint open.
  if (!process.env.CRON_SECRET) {
    res.status(500).json({ error: 'Reminder cron is not fully configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    res.status(500).json({ error: 'Reminder cron is not fully configured' });
    return;
  }

  webpush.setVapidDetails(vapidSubject || 'mailto:admin@example.com', vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, reminder_time, reminder_timezone, reminder_last_sent_date')
    .eq('reminder_enabled', true);

  if (profilesError) {
    res.status(500).json({ error: profilesError.message });
    return;
  }

  let sent = 0;
  let skipped = 0;

  for (const profile of profiles || []) {
    const { date: localDate, time: localTime } = localDateAndTime(profile.reminder_timezone);
    const alreadySentToday = profile.reminder_last_sent_date === localDate;
    const timeHasPassed = localTime >= (profile.reminder_time || '19:00');
    if (alreadySentToday || !timeHasPassed) { skipped++; continue; }

    const { data: todaysLogs } = await supabase
      .from('food_logs')
      .select('id')
      .eq('user_id', profile.id)
      .eq('logged_date', localDate)
      .limit(1);

    // Mark as handled for today regardless of outcome, so this user isn't
    // re-checked on every subsequent cron run for the rest of the day.
    await supabase.from('profiles').update({ reminder_last_sent_date: localDate }).eq('id', profile.id);

    if (todaysLogs && todaysLogs.length > 0) { skipped++; continue; }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, subscription')
      .eq('user_id', profile.id);

    const payload = JSON.stringify({
      title: 'Attune',
      body: "You haven't logged any food today yet — a quick log now keeps your streak going.",
      url: '/food',
    });

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        // 404/410 means the browser revoked or expired this subscription —
        // clean it up so future runs don't keep retrying a dead endpoint.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Push send failed:', sub.endpoint, err.message);
        }
      }
    }
  }

  let digest = { checked: 0, sent: 0 };
  try {
    digest = await runInactiveClientDigest(supabase);
  } catch (err) {
    console.error('Inactive-client digest failed:', err);
  }

  let checkins = { checked: 0, sent: 0 };
  try {
    checkins = await runCheckinDueNudges(supabase);
  } catch (err) {
    console.error('Check-in nudges failed:', err);
  }

  let freeMonth = { checked: 0, sent: 0 };
  try {
    freeMonth = await runFreeMonthReminder(supabase);
  } catch (err) {
    console.error('Free-month reminder failed:', err);
  }

  let fastEnds = { checked: 0, sent: 0 };
  try {
    fastEnds = await runFastEndNudges(supabase);
  } catch (err) {
    console.error('Fast-end nudges failed:', err);
  }

  res.status(200).json({ checked: (profiles || []).length, sent, skipped, digest, checkins, freeMonth, fastEnds });
}
