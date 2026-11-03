// Pure helpers for the fasting timer (src/pages/Fasting.jsx). A fast is a row
// { started_at, target_hours, ended_at } — "running" while ended_at is null.
// Everything here takes the current time as an argument so it's testable.

export const FAST_PRESETS = [
  { hours: 12, label: '12:12' },
  { hours: 14, label: '14:10' },
  { hours: 16, label: '16:8' },
  { hours: 18, label: '18:6' },
  { hours: 20, label: '20:4' },
];
export const DEFAULT_FAST_HOURS = 16;
export const MIN_FAST_HOURS = 1;
export const MAX_FAST_HOURS = 72;

const HOUR_MS = 3600000;

// Whole or half hours only, inside the range the database accepts; anything
// else (empty box, NaN, 0.2) → null so the caller can refuse to start.
export function parseTargetHours(input) {
  const n = typeof input === 'number' ? input : Number(String(input).trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 2) / 2;
  if (rounded < MIN_FAST_HOURS || rounded > MAX_FAST_HOURS) return null;
  return rounded;
}

export function fastEndsAt(fast) {
  return new Date(new Date(fast.started_at).getTime() + Number(fast.target_hours) * HOUR_MS);
}

// elapsed / goal for a running fast. pct is capped at 1 for the bar; `over`
// is how far past the goal it has run (0 until it gets there).
export function fastProgress(fast, nowMs) {
  const start = new Date(fast.started_at).getTime();
  const end = fast.ended_at ? new Date(fast.ended_at).getTime() : nowMs;
  const elapsedMs = Math.max(0, end - start);
  const targetMs = Number(fast.target_hours) * HOUR_MS;
  return {
    elapsedMs,
    targetMs,
    pct: targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0,
    done: elapsedMs >= targetMs,
    overMs: Math.max(0, elapsedMs - targetMs),
    remainingMs: Math.max(0, targetMs - elapsedMs),
  };
}

// "14:32:08" for the live clock.
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// "14h 32m" for history rows and hints; "45m" under an hour.
export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHours(hours) {
  const n = Number(hours);
  return Number.isInteger(n) ? `${n}h` : `${n.toFixed(1)}h`;
}

// A finished fast "hit" its goal if it ran at least as long as planned.
export function hitGoal(fast) {
  return fastProgress(fast, new Date(fast.ended_at).getTime()).done;
}

// ─── stages ───────────────────────────────────────────────────────────────
// A rough, friendly guide to what a fast "feels like" as it goes on. These are
// general ideas, not measurements — the page says so — and deliberately make no
// claim about how much fat anyone is burning.
export const FAST_STAGES = [
  { fromHours: 0, key: 'fed', title: 'Digesting', note: 'Your body is still working through your last meal.', icon: 'ti-tools-kitchen-2' },
  { fromHours: 4, key: 'settling', title: 'Settling', note: 'Digestion has wound down and blood sugar is steadying.', icon: 'ti-wave-sine' },
  { fromHours: 8, key: 'fasting', title: 'Fasting', note: 'Your body leans more on stored energy between meals.', icon: 'ti-flame' },
  { fromHours: 12, key: 'extended', title: 'Extended fast', note: 'Past the half-day mark — keep water and electrolytes up.', icon: 'ti-moon-stars' },
  { fromHours: 18, key: 'long', title: 'Long fast', note: 'A long stretch. Listen to your body and end it if you feel unwell.', icon: 'ti-hourglass' },
];

// The stage someone is in after `elapsedMs`, plus the next one (null at the end).
export function fastStage(elapsedMs) {
  const hours = Math.max(0, elapsedMs) / HOUR_MS;
  let index = 0;
  FAST_STAGES.forEach((s, i) => { if (hours >= s.fromHours) index = i; });
  const next = FAST_STAGES[index + 1] || null;
  return { ...FAST_STAGES[index], index, next, untilNextMs: next ? Math.max(0, next.fromHours * HOUR_MS - elapsedMs) : 0 };
}

// ─── changing the goal ────────────────────────────────────────────────────
export const EXTEND_STEP_HOURS = 2;

// The goal after adding `addHours`, held inside what the database accepts.
export function extendedTarget(currentHours, addHours = EXTEND_STEP_HOURS) {
  return Math.min(MAX_FAST_HOURS, Math.round((Number(currentHours) + addHours) * 2) / 2);
}

// ─── history ──────────────────────────────────────────────────────────────
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const finished = (fasts) => (fasts || []).filter((f) => f.ended_at);

// Consecutive days, counting back from today, on which a fast ended having hit
// its goal. A day with no goal-met fast breaks the streak — except today, which
// is still in progress and so doesn't count against it yet.
export function fastStreak(fasts, nowMs) {
  const days = new Set(finished(fasts).filter(hitGoal).map((f) => dayKey(new Date(f.ended_at))));
  const today = new Date(nowMs);
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

// The last seven days (oldest first, today last): did a fast end that day, did
// it reach its goal, plus the average length and how many days hit the goal.
export function weekSummary(fasts, nowMs) {
  const today = new Date(nowMs);
  const byDay = new Map();
  for (const f of finished(fasts)) {
    const k = dayKey(new Date(f.ended_at));
    const ran = fastProgress(f, new Date(f.ended_at).getTime()).elapsedMs;
    const cur = byDay.get(k) || { ran: 0, hit: false, count: 0 };
    byDay.set(k, { ran: cur.ran + ran, hit: cur.hit || hitGoal(f), count: cur.count + 1 });
  }
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const entry = byDay.get(dayKey(date));
    days.push({ date, key: dayKey(date), isToday: i === 0, fasted: !!entry, hit: !!entry?.hit, ranMs: entry?.ran || 0 });
  }
  const withFast = days.filter((d) => d.fasted);
  return {
    days,
    hitCount: days.filter((d) => d.hit).length,
    avgMs: withFast.length ? withFast.reduce((a, d) => a + d.ranMs, 0) / withFast.length : 0,
  };
}
