import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { useClosingTransition } from '../hooks/useClosingTransition';

// The mobile bottom nav's center "+" — everything that used to need its
// own nav slot (barcode scan, photo scan, menu scan, recipes, custom
// food) lives here instead.
//
// Scans deep-link straight into their modal on Food search (via
// location-state flags read there); Recipes now has its own real page
// (src/pages/Recipes.jsx) instead of landing on the general search page
// or a cramped popup. Log weight goes to Expenditure (Progress's old
// weight chart lives there now) — that's the only place a new weight
// entry can be logged from since the dashboard's inline weight form was
// replaced by a glance-tile there.
const TOP_ACTIONS = [
  { id: 'log-food', label: 'Log food', icon: 'ti-search', to: '/food' },
  { id: 'barcode', label: 'Scan barcode', icon: 'ti-barcode', to: '/food', state: { openScan: true } },
  { id: 'photo', label: 'Scan photo', icon: 'ti-camera', to: '/food', state: { openPhotoScan: true } },
  { id: 'menu', label: 'Scan menu', icon: 'ti-tools-kitchen-2', to: '/food', state: { openMenuScan: true } },
];
const BOTTOM_ACTIONS = [
  { id: 'weight', label: 'Log weight', icon: 'ti-scale', to: '/expenditure' },
  { id: 'recipes', label: 'Recipes', icon: 'ti-bookmark', to: '/recipes' },
  { id: 'custom-food', label: 'Custom food', icon: 'ti-plus', to: '/food', state: { openCreateFood: true } },
];

// Icon-over-label tile, laid out in a horizontal row — matches the bottom
// nav bar's own icon+label style, so these four sit the same way the app's
// top-level nav icons do instead of stacking as a list.
function ActionTile({ action, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate(action.to, action.state)}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', padding: '10px 2px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${action.icon}`} style={{ fontSize: 19, color: 'var(--accent)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'center', lineHeight: 1.25 }}>{action.label}</span>
    </button>
  );
}

function ActionRow({ action, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate(action.to, action.state)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        background: 'none', border: 'none', padding: '12px 4px', cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${action.icon}`} style={{ fontSize: 17, color: 'var(--accent)' }} />
      </div>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{action.label}</span>
    </button>
  );
}

// How far down (px) the sheet has to be dragged before release counts as
// "dismiss" rather than "snap back" — capped at 120px so it doesn't take
// an unreasonably long drag on a tall panel.
const DISMISS_FRACTION = 0.28;
const DISMISS_MAX = 120;

export default function QuickActionSheet({ onClose }) {
  const navigate = useNavigate();
  const { closing, close } = useClosingTransition(onClose);
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  // Mutable drag bookkeeping — deliberately not React state, since we
  // want the panel to follow the finger at 60fps via direct style writes
  // rather than round-tripping through a re-render on every pointermove.
  const drag = useRef({ startY: 0, active: false, y: 0 });

  function go(to, state) {
    navigate(to, state ? { state } : undefined);
    close();
  }

  function handlePointerDown(e) {
    drag.current = { startY: e.clientY, active: false, y: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    const d = drag.current;
    const delta = e.clientY - d.startY;
    if (!d.active) {
      // Ignore small jitter and any upward movement — only a deliberate
      // downward drag should hijack the gesture; anything else (a tap on
      // an action tile/row) must keep working as a normal click.
      if (delta < 8) return;
      d.active = true;
      if (panelRef.current) panelRef.current.style.transition = 'none';
    }
    const clamped = Math.max(0, delta);
    d.y = clamped;
    if (panelRef.current) panelRef.current.style.transform = `translateY(${clamped}px)`;
  }

  function handlePointerUp() {
    const d = drag.current;
    if (!d.active) { drag.current = { startY: 0, active: false, y: 0 }; return; }
    const panel = panelRef.current;
    const threshold = panel ? Math.min(DISMISS_MAX, panel.offsetHeight * DISMISS_FRACTION) : DISMISS_MAX;
    if (panel) panel.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)';
    if (d.y > threshold) {
      // Dragged past the threshold — finish the slide down and fade the
      // backdrop in step, bypassing the shared modal-panel/-backdrop
      // keyframes (a scale+fade, not a slide) so the exit continues
      // smoothly from wherever the drag left off instead of snapping
      // back to play a different animation.
      if (panel) panel.style.transform = 'translateY(100%)';
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 200ms ease-out';
        backdropRef.current.style.opacity = '0';
      }
      setTimeout(onClose, 200);
    } else if (panel) {
      panel.style.transform = 'translateY(0)';
    }
    drag.current = { startY: 0, active: false, y: 0 };
  }

  return (
    <div
      ref={backdropRef}
      onClick={close}
      className={`modal-backdrop${closing ? ' is-closing' : ''}`}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', borderBottom: 'none', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 460, padding: '10px 20px 24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', touchAction: 'none' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-strong)', margin: '6px auto 16px' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {TOP_ACTIONS.map(a => <ActionTile key={a.id} action={a} onNavigate={go} />)}
        </div>
        <div style={{ height: 1, background: 'var(--border-default)', margin: '18px 0 4px' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {BOTTOM_ACTIONS.map(a => <ActionRow key={a.id} action={a} onNavigate={go} />)}
        </div>
      </div>
    </div>
  );
}
