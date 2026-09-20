import { daysBetween } from '../src/lib/dates.js';

// Pure helpers for the coach push notifications (client replies and the
// inactive-clients digest). No I/O, so they're unit-tested in
// _coachPush.test.js; the endpoints that use them —
// notify-trainer-comment.js and send-reminders.js — stay thin.
// (Underscore-prefixed so Vercel doesn't deploy it as an endpoint; the
// project sits exactly at the Hobby plan's 12-function cap.)

export function firstName(name, fallback) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first || fallback;
}

// Deliberately generic — a push shows on the lock screen, and what a client
// wrote to their coach shouldn't.
export function replyPayload(clientName) {
  return { title: 'Attune', body: `${firstName(clientName, 'A client')} sent you a message`, url: '/coach' };
}

export function digestPayload(count, days) {
  return {
    title: 'Attune',
    body: count === 1
      ? `1 client hasn't logged in ${days}+ days`
      : `${count} clients haven't logged in ${days}+ days`,
    url: '/coach',
  };
}

// A client firing off several replies in a row shouldn't buzz their coach's
// phone for each one. `timesDesc` is that client's message timestamps to this
// trainer, newest first, *including* the one that triggered this call: only
// the first of a burst notifies. Anything unparseable errs towards notifying.
export function withinThrottle(timesDesc, windowMs = 120000) {
  if (!Array.isArray(timesDesc) || timesDesc.length < 2) return false;
  const latest = new Date(timesDesc[0]).getTime();
  const previous = new Date(timesDesc[1]).getTime();
  if (Number.isNaN(latest) || Number.isNaN(previous)) return false;
  return latest - previous < windowMs;
}

// Which of a trainer's active clients have gone quiet. A client who has
// logged before is inactive once their last log is `days`+ days old; one who
// has *never* logged is measured from when they connected, so a brand-new
// client isn't flagged on day one but isn't ignored forever either.
// links: [{ client_id, created_at }]; lastLogByClient: { [client_id]: 'YYYY-MM-DD' }.
export function pickInactive(links, lastLogByClient, today, days = 3) {
  return (links || []).filter((link) => {
    const last = lastLogByClient?.[link.client_id];
    const since = daysBetween(last || String(link.created_at).slice(0, 10), today);
    return Number.isFinite(since) && since >= days;
  });
}

// Local hour gate for the once-a-day digest: not before 09:00 in the
// trainer's own timezone, so it lands with the morning rather than at 3am.
export function digestDue(localTime, lastSentDate, localDate, notBefore = '09:00') {
  return lastSentDate !== localDate && localTime >= notBefore;
}

// ── check-in due notifications ──────────────────────────────────────────────

export function checkinPayload(coachName) {
  return { title: 'Attune', body: `${firstName(coachName, 'Your coach')} sent you a check-in`, url: '/coach' };
}

// Which check-in forms should nudge their client right now? One that is due
// (a form never answered is due from creation; otherwise `cadence_days` after
// the last answer) and hasn't already been nudged for *this* due date —
// last_notified_at is stamped when a push goes out, so a client who ignores it
// isn't re-pinged every 15 minutes, but the next cycle notifies again.
// forms: [{ id, cadence_days, created_at, last_notified_at }];
// lastResponseByForm: { [formId]: ISO timestamp }.
export function pickDueForms(forms, lastResponseByForm, nowMs = Date.now()) {
  const day = 86400000;
  return (forms || []).filter((form) => {
    const last = lastResponseByForm?.[form.id];
    const dueAt = last ? new Date(last).getTime() + form.cadence_days * day : new Date(form.created_at).getTime();
    if (!Number.isFinite(dueAt) || nowMs < dueAt) return false;
    const notifiedAt = form.last_notified_at ? new Date(form.last_notified_at).getTime() : null;
    return notifiedAt == null || notifiedAt < dueAt;
  });
}

// Don't buzz someone at 3am: only between 08:00 and 21:00 in their own
// timezone (localTime is 'HH:MM'). Callers skip this check when the person's
// timezone isn't known.
export function withinWakingHours(localTime) {
  return localTime >= '08:00' && localTime <= '21:00';
}

