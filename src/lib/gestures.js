// The maths behind the touch gestures (pull-to-refresh, swipe-between-days),
// kept apart from the DOM wiring in hooks/ so the thresholds are testable.

export const PULL_THRESHOLD = 64; // px of (damped) pull that triggers a refresh
export const PULL_MAX = 110;      // the indicator never travels further than this

/** Finger travel -> indicator travel: follows the finger, then resists. */
export function pullDistance(dy) {
  if (!(dy > 0)) return 0;
  return Math.min(PULL_MAX, dy * 0.55);
}

export const SWIPE_MIN_DISTANCE = 70;
export const SWIPE_EDGE_PX = 24;   // left-edge strip is left alone (see the body::before note in index.css)
export const SWIPE_MAX_MS = 700;

/**
 * Is this touch a deliberate horizontal day-swipe? 'prev' for a swipe to the
 * right (back in time), 'next' for a swipe to the left, otherwise null.
 * Mostly-vertical drags (scrolling) and slow drags never count.
 */
export function classifySwipe({ startX, dx, dy, ms }) {
  if (startX < SWIPE_EDGE_PX) return null;
  if (ms > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * 0.5) return null;
  return dx > 0 ? 'prev' : 'next';
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' shifted by whole days — UTC maths, so DST can't skip or repeat a day. */
export function shiftDate(date, delta) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
