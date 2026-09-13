// Cron endpoint (see vercel.json) that sends the "log your food" reminder
// push to any user whose local reminder time has passed today and who
// hasn't been notified yet today. Runs on a schedule rather than at the
// exact minute someone picked — "has today's reminder time already passed,
// and have we not sent one yet today" is deliberately tolerant of that,
// since Vercel cron granularity varies by plan and a tight per-minute
// match would silently miss people between runs.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

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
  // notifications on repeat, or run up billing). Vercel automatically
  // sends this exact header on cron-triggered requests when CRON_SECRET
  // is set in the project's environment variables — set that in Vercel,
  // and only Vercel's own scheduler (or someone who has that secret) can
  // trigger a send.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
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

  res.status(200).json({ checked: (profiles || []).length, sent, skipped });
}
