// The "your fast has ended" push, run from api/send-reminders.js (the project is
// at Vercel's 12-function cap, so it can't be its own endpoint). Pure helpers
// live here so they can be unit-tested without a database.

const HOUR_MS = 3600000;

// Running fasts (not ended, not yet notified) whose goal time has arrived.
export function pickFinishedFasts(fasts, nowMs) {
  return (fasts || []).filter((f) => {
    if (f.ended_at || f.end_notified_at) return false;
    const start = new Date(f.started_at).getTime();
    const hours = Number(f.target_hours);
    if (!Number.isFinite(start) || !Number.isFinite(hours) || hours <= 0) return false;
    return start + hours * HOUR_MS <= nowMs;
  });
}

export function fastEndPayload(targetHours) {
  const n = Number(targetHours);
  const label = Number.isInteger(n) ? `${n}-hour` : `${n.toFixed(1)}-hour`;
  return {
    title: 'Attune',
    body: `Your ${label} fast is complete — nice work. Eat when you're ready.`,
    url: '/fasting',
  };
}
