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

  function reset() {
    start.current = null;
    moved.current = false;
    setDragging(false);
  }

  function onDown(e) {
    if (disabled) return;
    start.current = e.clientX;
    startOffset.current = offset;
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
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
    if (start.current == null) return;
    if (moved.current) {
      suppressClick.current = true;
      setOffset(prev => (prev <= -COMMIT_AT ? -DELETE_W : 0));
    }
    reset();
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
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: DELETE_W,
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
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={reset}
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
