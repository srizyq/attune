import { useEffect, useState } from 'react';

// Bottom-of-screen confirmation/error toast — shared by FoodSearch and
// Recipes (both need the exact same success/error feedback after a
// food-log write). Positioning relies on the .toast-in/.toast-out
// keyframes in index.css, which already bake in translateX(-50%) — an
// inline transform here would just fight the animation.
export default function Toast({ message, error, onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 2200 - 160);
    const doneTimer = setTimeout(onDone, 2200);
    return () => { clearTimeout(leaveTimer); clearTimeout(doneTimer); };
  }, [onDone]);
  return (
    <div
      className={leaving ? 'toast-out' : 'toast-in'}
      style={{
        position: 'fixed', bottom: 28, left: '50%', borderRadius: 10, padding: '10px 20px', fontSize: 14, zIndex: 100,
        whiteSpace: 'nowrap', pointerEvents: 'none',
        background: error ? '#1a0f0f' : 'var(--accent-bg)',
        border: `1px solid ${error ? '#c0707040' : 'var(--accent-dark)'}`,
        color: error ? 'var(--danger)' : 'var(--accent)',
      }}
    >
      {error ? '✕' : '✓'} {message}
    </div>
  );
}
