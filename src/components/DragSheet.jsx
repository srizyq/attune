import { useRef, useState } from 'react';

// Full-screen sheet, dismissed by dragging down from the handle/header
// (like a native iOS sheet) instead of a centered card over a backdrop —
// shared by PhotoScanModal and MenuScanModal, which both used to be
// small, dark-hardcoded cards regardless of the app's actual light/dark
// theme. The drag region is deliberately just the handle+header, not the
// whole sheet — dragging inside the content (macros, a comment textarea)
// needs to scroll normally, not fight a dismiss gesture.
export default function DragSheet({ title, onClose, closing, children, headerRight }) {
  const [dragY, setDragY] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const drag = useRef({ startY: 0, dy: 0, dragging: false });

  function onPointerDown(e) {
    drag.current = { startY: e.clientY, dy: 0, dragging: true };
    setReleasing(false);
  }
  function onPointerMove(e) {
    if (!drag.current.dragging) return;
    let dy = e.clientY - drag.current.startY;
    if (dy < 0) dy *= 0.2; // slight resistance if dragged upward past the top
    drag.current.dy = dy;
    setDragY(dy);
  }
  function onPointerUp() {
    if (!drag.current.dragging) return;
    drag.current.dragging = false;
    setReleasing(true);
    if (drag.current.dy > 120) {
      // Finish the drag the rest of the way off-screen instead of
      // snapping back then playing a separate close animation — this IS
      // the close animation, continuing from wherever the finger let go.
      setDragY(window.innerHeight);
      setTimeout(onClose, 220);
    } else {
      setDragY(0);
    }
  }

  return (
    <div
      className={`sheet-panel${closing ? ' is-closing' : ''}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column',
        transform: dragY ? `translateY(${Math.max(0, dragY)}px)` : undefined,
        transition: releasing ? 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', touchAction: 'none', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 36, height: 5, borderRadius: 99, background: 'var(--border-strong)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 20px 14px', borderBottom: '1px solid var(--border-default)' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{title}</span>
          {headerRight || (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 20 }}>
        {children}
      </div>
    </div>
  );
}
