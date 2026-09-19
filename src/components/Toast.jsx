import { useEffect, useState } from 'react';

// Bottom-of-screen confirmation/error toast — shared by FoodSearch and
// Recipes (both need the exact same success/error feedback after a
// food-log write). Positioning relies on the .toast-in/.toast-out
// keyframes in index.css, which already bake in translateX(-50%) — an
// inline transform here would just fight the animation.
export default function Toast({ message, error, onDone, action, duration = 2200 }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), duration - 160);
    const doneTimer = setTimeout(onDone, duration);
    return () => { clearTimeout(leaveTimer); clearTimeout(doneTimer); };
  }, [onDone, duration]);
  return (
    <div
      className={leaving ? 'toast-out' : 'toast-in'}
      style={{
        // See SettingsGoals' identical comment — 100vh minus the
        // keyboard-shrunk --vvh adds the keyboard's own height back in
        // when one's open, so this stays 28px above the keyboard instead
        // of 28px above the real, keyboard-covered screen edge.
        position: 'fixed', bottom: 'calc(28px + (100vh - var(--vvh, 100vh)))', left: '50%', borderRadius: 10, padding: '10px 20px', fontSize: 14, zIndex: 100,
        whiteSpace: 'nowrap', pointerEvents: action ? 'auto' : 'none',
        background: error ? '#1a0f0f' : 'var(--accent-bg)',
        border: `1px solid ${error ? '#c0707040' : 'var(--accent-dark)'}`,
        color: error ? 'var(--danger)' : 'var(--accent)',
      }}
    >
      {error ? '✕' : '✓'} {message}
      {action && (
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, fontSize: 14, marginLeft: 14, padding: 0, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>{action.label}</button>
      )}
    </div>
  );
}
