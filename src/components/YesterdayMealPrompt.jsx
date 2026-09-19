import { useRef, useState } from 'react';

const THRESHOLD = 80;

// MyFitnessPal-style empty-meal row: swipe right to log yesterday's meal
// again, with yesterday's foods listed underneath. A plain tap works too so
// it isn't unusable with a mouse or assistive tech.
export default function YesterdayMealPrompt({ names, onCommit, disabled }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const moved = useRef(false);

  function reset() { start.current = null; moved.current = false; setDragging(false); setDx(0); }

  function onDown(e) {
    if (disabled) return;
    start.current = e.clientX;
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (start.current == null) return;
    const d = e.clientX - start.current;
    if (Math.abs(d) > 6) moved.current = true;
    if (moved.current) { setDragging(true); setDx(Math.max(0, Math.min(d, 160))); }
  }
  function onUp() {
    if (start.current == null) return;
    const commit = dx >= THRESHOLD || !moved.current;
    reset();
    if (commit) onCommit();
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--border-default)', background: 'var(--accent-bg)' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 18, color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>
        <i className="ti ti-arrow-back-up" style={{ marginRight: 6, fontSize: 16 }} /> Log again
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={reset}
        style={{
          position: 'relative', background: 'var(--bg-subtle)', padding: '14px 18px', cursor: disabled ? 'default' : 'pointer',
          touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', opacity: disabled ? 0.6 : 1,
          transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Swipe right to log yesterday's meal again</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names}</div>
      </div>
    </div>
  );
}
