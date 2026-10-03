import { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

// A compact, dismissible strip (same shell as TrialBanner) offering to put
// Attune on the home screen. On iPhone installing is manual, so "Show me how"
// opens the three steps; where the browser offers a real install dialog
// (Chrome on Android/desktop) it's one tap.
const STEPS = [
  { icon: 'ti-share-2', text: <>Tap the <strong>Share</strong> button in Safari's toolbar (the square with an arrow).</> },
  { icon: 'ti-square-plus', text: <>Scroll down and tap <strong>Add to Home Screen</strong>.</> },
  { icon: 'ti-check', text: <>Tap <strong>Add</strong> — Attune now opens like an app.</> },
];

export default function InstallPrompt({ style }) {
  const { show, mode, install, dismiss } = useInstallPrompt();
  const [stepsOpen, setStepsOpen] = useState(false);
  if (!show) return null;

  return (
    <>
      <div role="region" aria-label="Install Attune" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: '12px 12px 12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, ...style }}>
        <i className="ti ti-device-mobile-down" aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 22, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Install Attune</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {mode === 'ios' ? 'Full-screen, faster, and needed for reminders.' : 'Opens full-screen, like an app.'}
          </div>
        </div>
        <button
          onClick={mode === 'ios' ? () => setStepsOpen(true) : install}
          style={{ flexShrink: 0, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 999, padding: '0 14px', minHeight: 36, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {mode === 'ios' ? 'Show me how' : 'Install'}
        </button>
        <button onClick={dismiss} aria-label="Dismiss" style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '8px 6px', minHeight: 36 }}>✕</button>
      </div>

      {stepsOpen && (
        <div onClick={() => setStepsOpen(false)} className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            role="dialog" aria-modal="true" aria-label="Add Attune to your Home Screen"
            onClick={(e) => e.stopPropagation()}
            className="modal-panel"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: '16px 16px 0 0', padding: '20px 20px calc(20px + var(--safe-bottom, 0px))', width: '100%', maxWidth: 480, boxSizing: 'border-box' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: 'var(--text-primary)' }}>Add Attune to your Home Screen</h3>
              <button onClick={() => setStepsOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px 6px' }}>✕</button>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {STEPS.map((s, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    <i className={`ti ${s.icon}`} />
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.45 }}><strong style={{ color: 'var(--text-primary)' }}>{i + 1}.</strong> {s.text}</span>
                </li>
              ))}
            </ol>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Not seeing Add to Home Screen? Open this page in Safari first — other apps' built-in browsers don't have it.
            </p>
            <button onClick={() => { setStepsOpen(false); dismiss(); }} style={{ marginTop: 14, width: '100%', minHeight: 44, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
