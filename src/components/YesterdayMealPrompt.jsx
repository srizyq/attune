import { useRef, useState } from 'react';

const HANDLE = 44;
const PAD = 4;
const COMMIT_AT = 0.65;

// Slide-to-log control shown on an empty meal card: drag the handle right
// (or tap / press Enter) to log yesterday's version of this meal again.
// Yesterday's foods and calories are listed so it's clear what you're about
// to add.
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
    setMaxDx(Math.max(1, (track.current?.offsetWidth || 300) - HANDLE - PAD * 2));
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

  const progress = disabled ? 1 : Math.min(1, dx / maxDx);
  const label = mealLabel.toLowerCase();

  return (
    <div style={{ padding: '2px 12px 12px' }}>
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
          position: 'relative', overflow: 'hidden', height: HANDLE + PAD * 2, borderRadius: (HANDLE + PAD * 2) / 2,
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
          cursor: disabled ? 'default' : 'pointer', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: disabled ? '100%' : dx + HANDLE + PAD * 2, borderRadius: (HANDLE + PAD * 2) / 2,
            background: 'var(--accent)', opacity: 0.16 + progress * 0.14,
            transition: dragging ? 'none' : 'width 0.25s ease, opacity 0.25s ease',
          }}
        />
        <div
          className={!dragging && !disabled ? 'slide-hint' : undefined}
          style={{
            position: 'absolute', top: PAD, left: PAD, width: HANDLE, height: HANDLE, borderRadius: '50%',
            background: 'var(--accent)', color: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            transform: disabled ? undefined : `translateX(${dx}px)`,
            ...(disabled ? { left: `calc(100% - ${HANDLE + PAD}px)` } : {}),
            transition: dragging ? 'none' : 'transform 0.25s ease, left 0.25s ease',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={disabled ? { animation: 'spin 0.8s linear infinite' } : undefined}>
            {disabled ? <path d="M12 3a9 9 0 1 0 9 9" /> : <><path d="M7 6l6 6-6 6" /><path d="M13 6l6 6-6 6" /></>}
          </svg>
        </div>
        <div
          style={{
            position: 'absolute', left: HANDLE + PAD * 2 + 12, right: 16, top: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0,
            opacity: disabled ? 0.9 : 1 - progress * 0.7, transition: dragging ? 'none' : 'opacity 0.2s ease',
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {disabled ? 'Logging…' : `Log yesterday's ${label}`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {names}{kcal ? ` · ${kcal} kcal` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
