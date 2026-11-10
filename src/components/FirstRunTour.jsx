import { useEffect, useState } from 'react';

const KEY = 'attune.tourSeen.v1';
export const TOUR_EVENT = 'attune:tour';

const STEPS = [
  { icon: 'ti-sparkles', title: 'Welcome to Attune', body: 'Log food, see your macros and nutrients, and notice how what you eat makes you feel. Here is a 30-second look around.' },
  { icon: 'ti-plus', title: 'Log in seconds', body: 'Tap Add to search foods, scan a barcode, snap a photo of your meal, or say what you ate.' },
  { icon: 'ti-chart-bar', title: 'See the pattern', body: 'Nutrients and Expenditure show how your intake, weight and energy trend over time.' },
  { icon: 'ti-clock-hour-4', title: 'Fasting and friends', body: 'Time your fasts, and invite friends to see each other’s day and share recipes.' },
  { icon: 'ti-settings', title: 'Make it yours', body: 'Set goals in Settings. You can replay this tour any time from Settings, and sync offline entries there too.' },
];

function seen() { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }

export default function FirstRunTour({ enabled }) {
  const [step, setStep] = useState(enabled && !seen() ? 0 : -1);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);
  useEffect(() => { if (enabled && !seen()) setStep(0); }, [enabled]);

  if (step < 0) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => { markSeen(); setStep(-1); };

  return (
    <div role="dialog" aria-modal="true" aria-label="App tour" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 20, padding: 24, textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <i className={`ti ${s.icon}`} style={{ fontSize: 36, color: 'var(--accent)' }} />
        <h2 style={{ margin: '12px 0 8px', fontSize: 20, color: 'var(--text-primary)' }}>{s.title}</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--text-muted)' }}>{s.body}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '18px 0' }}>
          {STEPS.map((_, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 99, background: i === step ? 'var(--accent)' : 'var(--card-border)' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={close} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--card-border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 15, cursor: 'pointer' }}>Skip</button>
          <button onClick={() => (last ? close() : setStep(step + 1))} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
