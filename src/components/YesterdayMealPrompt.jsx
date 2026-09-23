import { useRef, useState } from 'react';

const ICON = 26;
const ROW_H = 40;
const COMMIT_AT = 0.55;

// Slim row shown on an empty meal card, styled like a plain list row (a
// small square icon tile + one line of text) rather than a pill or a
// button — swipe it right (or tap / press Enter) to log yesterday's
// version of this meal again. Deliberately quiet: it's a shortcut sitting
// among other rows, not a call to action competing with "+ Add food".
export default function YesterdayMealPrompt({ mealLabel, names, kcal, onCommit, disabled }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const track = useRef(null);
  const start = useRef(null);
  const moved = useRef(false);
  const [maxDx, setMaxDx] = useState(1);

  function reset() { start.current = null; moved.current = false; setDragging(false); setDx(0); }

  function onDown(e) {
    if (disabled) return;
    start.current = e.clientX;
    moved.current = false;
    setMaxDx(Math.max(1, (track.current?.offsetWidth || 300) - ICON - 20));
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (start.current == null) return;
    const d = e.clientX - start.current;
    if (Math.abs(d) > 6) moved.current = true;
    if (moved.current) { setDragging(true); setDx(Math.max(0, Math.min(d, maxDx))); }
  }
  function onUp() {
    if (start.current == null) return;
    const commit = dx >= maxDx * COMMIT_AT || !moved.current;
    reset();
    if (commit) onCommit();
  }

  const label = mealLabel.toLowerCase();

  return (
    <div style={{ padding: '0 12px 8px' }}>
      <div
        ref={track}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={reset}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Log yesterday's ${label} again`}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onCommit(); } }}
        style={{
          position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 10,
          height: ROW_H, padding: '0 10px', borderRadius: 10,
          background: dragging ? 'var(--accent-bg)' : 'var(--bg-primary)',
          border: `1px solid ${dragging ? 'var(--accent-border)' : 'var(--border-default)'}`,
          cursor: disabled ? 'default' : 'pointer', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        <div
          className={!dragging && !disabled ? 'slide-hint' : undefined}
          style={{
            flexShrink: 0, width: ICON, height: ICON, borderRadius: 8,
            background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `translateX(${dx}px)`,
            transition: dragging ? 'none' : 'transform 0.25s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={disabled ? { animation: 'spin 0.8s linear infinite' } : undefined}>
            {disabled ? <path d="M12 3a9 9 0 1 0 9 9" /> : <path d="M9 6l6 6-6 6" />}
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {disabled ? 'Logging…' : `Log yesterday's ${label}`}
          </span>
          {!disabled && <span style={{ color: 'var(--text-muted)' }}> — {names}{kcal ? ` · ${kcal} kcal` : ''}</span>}
        </div>
      </div>
    </div>
  );
}
