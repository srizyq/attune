import { useRef, useState } from 'react';

const DELETE_W = 76;
const COMMIT_AT = DELETE_W * 0.45;

// Swipe-left-to-reveal delete — the standard mobile list-row pattern (Mail,
// Gmail) — instead of every row needing its own tap-to-expand UI just to
// get at a delete button. Swiping uncovers a red Delete strip behind the
// row; releasing past the commit threshold snaps it fully open rather than
// springing shut, so a deliberate swipe doesn't also demand a second,
// precisely-placed tap to land on a half-revealed button. Tapping the row
// again while open closes it instead of running whatever the row's own
// onClick does — without that, the tap that dismisses the swipe would also
// fire the row's normal open/expand behaviour.
//
// Tracks the drag via window-level listeners (added on pointerdown, removed
// on pointerup/cancel) rather than setPointerCapture — capturing the
// pointer on the row itself turned out to make real Chromium retarget (and
// effectively drop) the native 'click' event a plain tap's pointerup
// produces, so a tap never reached the row's own onClick at all (caught by
// the e2e layout suite's real-browser clicks, not by jsdom unit tests —
// jsdom doesn't model that interaction). Window listeners get the same
// "keep tracking even once the finger leaves the row" behaviour capture
// exists for, without touching click dispatch.
export default function SwipeToDelete({ children, onDelete, disabled = false }) {
  const [offset, setOffset] = useState(0); // 0 (closed) .. -DELETE_W (open)
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const startOffset = useRef(0);
  const moved = useRef(false);
  // A real drag's pointerup is followed by a synthetic click on most
  // browsers regardless of how far the pointer travelled — this survives
  // past onUp's own reset (a separate event, asynchronous relative to it)
  // so the capture handler below can still tell "that click was the tail
  // of a drag" from "that click was a genuine tap".
  const suppressClick = useRef(false);

  function stopTracking() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }
  function onCancel() {
    stopTracking();
    start.current = null;
    moved.current = false;
    setDragging(false);
  }
  function onMove(e) {
    if (start.current == null) return;
    const d = e.clientX - start.current;
    if (Math.abs(d) > 6) moved.current = true;
    if (moved.current) {
      setDragging(true);
      setOffset(Math.max(-DELETE_W, Math.min(0, startOffset.current + d)));
    }
  }
  function onUp() {
    stopTracking();
    if (start.current == null) return;
    if (moved.current) {
      suppressClick.current = true;
      setOffset(prev => (prev <= -COMMIT_AT ? -DELETE_W : 0));
    }
    start.current = null;
    moved.current = false;
    setDragging(false);
  }
  function onDown(e) {
    if (disabled) return;
    start.current = e.clientX;
    startOffset.current = offset;
    moved.current = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function onClickCapture(e) {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      setOffset(0);
    }
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {!disabled && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOffset(0); onDelete(); }}
          aria-label="Delete"
          // Sits behind the row at all times (so it can slide into view as
          // you drag), but stays genuinely un-reachable — not just visually
          // covered — until actually revealed: hidden takes it out of
          // hit-testing, tab order and the accessibility tree, instead of
          // leaving an inert "Delete" button permanently behind every row.
          tabIndex={offset === 0 ? -1 : 0}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: DELETE_W,
            visibility: offset === 0 ? 'hidden' : 'visible',
            background: 'var(--danger)', border: 'none', color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
          }}
        >
          <i aria-hidden="true" className="ti ti-trash" style={{ fontSize: 17 }} />
          Delete
        </button>
      )}
      <div
        onPointerDown={onDown}
        onClickCapture={onClickCapture}
        style={{
          position: 'relative',
          transform: disabled ? undefined : `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          touchAction: disabled ? undefined : 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}
