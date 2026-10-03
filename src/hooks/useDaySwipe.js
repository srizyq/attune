import { useEffect, useRef } from 'react';
import { classifySwipe } from '../lib/gestures';

// A touch that starts in one of these belongs to something else: a text field,
// a sheet over the page, a swipe-to-delete row, or anything marked opt-out.
const IGNORE = 'input, textarea, select, [contenteditable="true"], [role="dialog"], .modal-panel, [data-no-gesture]';

// Inside something that scrolls sideways (a chip row, a tab strip) a
// horizontal drag is that thing's, not a day change.
function inHorizontalScroller(target, boundary) {
  for (let el = target; el && el !== boundary; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Swipe right = previous day, swipe left = next day, on the element `ref` is
 * attached to. `onPrev` / `onNext` may be null when that direction isn't
 * available (e.g. nothing after today). A swipe that begins in the left-edge
 * strip is ignored on purpose — see the body::before note in index.css.
 */
export function useDaySwipe({ onPrev, onNext, disabled = false }) {
  const ref = useRef(null);
  const handlers = useRef({ onPrev, onNext });
  useEffect(() => { handlers.current = { onPrev, onNext }; }, [onPrev, onNext]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return undefined;
    let t = null;
    const onStart = (e) => {
      if (e.touches.length !== 1 || e.target.closest?.(IGNORE) || inHorizontalScroller(e.target, el)) { t = null; return; }
      t = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
    };
    const onEnd = (e) => {
      if (!t) return;
      const touch = e.changedTouches[0];
      const dir = classifySwipe({ startX: t.x, dx: touch.clientX - t.x, dy: touch.clientY - t.y, ms: Date.now() - t.at });
      t = null;
      if (dir === 'prev') handlers.current.onPrev?.();
      else if (dir === 'next') handlers.current.onNext?.();
    };
    const cancel = () => { t = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [disabled]);

  return ref;
}
