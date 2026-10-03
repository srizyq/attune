import { useCallback, useEffect, useRef, useState } from 'react';
import { PULL_THRESHOLD, pullDistance } from '../lib/gestures';

// Touches that start in any of these are never a pull: a sheet/modal sitting
// over the page, or a control the user is interacting with.
const IGNORE = 'input, textarea, select, [contenteditable="true"], [role="dialog"], .modal-panel, [data-no-gesture]';
const MIN_SPIN_MS = 600; // a refresh that returns instantly still reads as having happened

/**
 * Pull down from the top of a scroll container to refresh, like every native
 * list. Returns [ref, { pull, refreshing }]: attach `ref` to the scrolling
 * element and render <PullIndicator {...state}> inside it; `onRefresh` should
 * return a promise.
 *
 * Listeners are native (not React's) because touchmove has to be
 * non-passive to cancel Safari's own pull-to-reload while the gesture is ours.
 */
export function usePullToRefresh(onRefresh, { disabled = false } = {}) {
  const ref = useRef(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0); // latest pull, readable from the touchend handler
  const setPullBoth = useCallback((v) => { pullRef.current = v; setPull(v); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const refreshFn = useRef(onRefresh);
  useEffect(() => { refreshFn.current = onRefresh; }, [onRefresh]);
  const busy = useRef(false);

  const run = useCallback(async () => {
    busy.current = true;
    setRefreshing(true);
    const started = Date.now();
    try { await refreshFn.current?.(); } catch (err) { console.error('Refresh failed:', err); }
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
    setTimeout(() => { busy.current = false; setRefreshing(false); setPullBoth(0); }, wait);
  }, [setPullBoth]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return undefined;
    let startY = null;
    let startX = 0;
    let pulling = false;

    const onStart = (e) => {
      if (busy.current || e.touches.length !== 1 || el.scrollTop > 0 || e.target.closest?.(IGNORE)) { startY = null; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = false;
    };
    const onMove = (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (!pulling) {
        // Not ours until it's clearly a downward drag from the very top.
        if (el.scrollTop > 0 || dy < 8 || Math.abs(dx) > dy) { if (dy < -4 || Math.abs(dx) > 12) startY = null; return; }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      setPullBoth(pullDistance(dy));
    };
    const onEnd = () => {
      if (startY == null) return;
      startY = null;
      if (!pulling) return;
      pulling = false;
      if (pullRef.current >= PULL_THRESHOLD) { setPullBoth(PULL_THRESHOLD); run(); } else setPullBoth(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, run, setPullBoth]);

  return [ref, { pull, refreshing }];
}
