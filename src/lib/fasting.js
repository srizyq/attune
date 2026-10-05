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
