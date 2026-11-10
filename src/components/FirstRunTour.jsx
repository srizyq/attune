import { useCallback, useEffect, useRef, useState } from 'react';

// A short guided tour of the Dashboard: dims the screen, lights up one thing at
// a time with a one-line explanation, and moves on when the person taps the lit-up
// thing. Taps are caught by the overlay (nothing underneath is really pressed), so
// nothing gets logged or opened by accident. Targets are found by data-tour="…"
// markers; a step whose target isn't on screen (e.g. Slots for a free account) is skipped.
import { TOUR_EVENT, tourSeen as seen, markTourSeen as markSeen, takeTourReplay as takeReplay } from '../lib/tour';

const STEPS = [
  { sel: '[data-tour="slots"]', title: 'Plan your day in Slots', body: 'Switch to Slots to split your day into your own time blocks, then tap Add slot to name each one.' },
  { sel: '[data-tour="calories"]', title: 'Your daily budget', body: 'This ring shows calories left today. The protein, carbs and fat bars sit just below it.' },
  { sel: '.app-bottom-add, [data-tour="add"]', title: 'Log in seconds', body: 'Tap + to search foods, scan a barcode, snap a photo or say what you ate.' },
  { sel: '[data-tour="trends"]', title: 'See your trends', body: 'Tap here to watch your intake and weight over time. Tap any macro for full nutrient details.' },
];

const PAD = 8;

function findTarget(sel) {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

// `enabled`: the person has just joined (so the tour should run by itself).
// `onDashboard`: the Dashboard is the screen showing.
export default function FirstRunTour({ enabled, onDashboard }) {
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState(null);
  const stepRef = useRef(-1);
  useEffect(() => { stepRef.current = step; }, [step]);

  const finish = useCallback(() => { markSeen(); setStep(-1); setRect(null); }, []);

  const nextFrom = useCallback((from) => {
    for (let i = from + 1; i < STEPS.length; i++) if (findTarget(STEPS[i].sel)) return i;
    return -1;
  }, []);

  // Start by itself for a new account, or on request (Replay tour in Settings).
  useEffect(() => {
    if (!onDashboard) return undefined;
    const auto = enabled && !seen();
    const replay = takeReplay();
    if (!auto && !replay) return undefined;
    const t = setTimeout(() => { const first = nextFrom(-1); if (first >= 0) setStep(first); else if (auto) markSeen(); }, 700);
    return () => clearTimeout(t);
  }, [enabled, onDashboard, nextFrom]);

  useEffect(() => {
    const onReplay = () => {
      if (!onDashboard) return; // Dashboard picks the stored request up when it opens
      takeReplay();
      const first = nextFrom(-1);
      if (first >= 0) setStep(first);
    };
    window.addEventListener(TOUR_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_EVENT, onReplay);
  }, [onDashboard, nextFrom]);

  // Light up the current step's target, and keep it lit through scrolls and resizes.
  useEffect(() => {
    if (step < 0) return undefined;
    const sel = STEPS[step].sel;
    let tries = 0;
    const measure = () => {
      const el = findTarget(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      return true;
    };
    const el = findTarget(sel);
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    measure();
    const poll = setInterval(() => {
      tries += 1;
      if (!measure() && tries > 8) { const n = nextFrom(stepRef.current); if (n >= 0) setStep(n); else finish(); }
    }, 250);
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      clearInterval(poll);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [step, nextFrom, finish]);

  useEffect(() => {
    if (step < 0) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, finish]);

  if (step < 0 || !rect) return null;
  const s = STEPS[step];
  const isLast = nextFrom(step) < 0;
  const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  const onOverlayTap = (e) => {
    const inside = e.clientX >= hole.left && e.clientX <= hole.left + hole.width && e.clientY >= hole.top && e.clientY <= hole.top + hole.height;
    if (!inside) return;
    const n = nextFrom(step);
    if (n < 0) finish(); else setStep(n);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(320, vw - 32);
  const below = hole.top + hole.height + 12 + 150 < vh;
  const cardTop = below ? hole.top + hole.height + 12 : Math.max(16, hole.top - 12 - 150);
  const cardLeft = Math.min(Math.max(16, hole.left + hole.width / 2 - cardW / 2), vw - cardW - 16);

  return (
    <div role="dialog" aria-modal="true" aria-label="App tour" onClick={onOverlayTap} style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <div aria-hidden="true" style={{
        position: 'fixed', top: hole.top, left: hole.left, width: hole.width, height: hole.height,
        borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)', border: '2px solid var(--accent)',
        pointerEvents: 'none', transition: 'all 200ms ease',
      }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'fixed', top: cardTop, left: cardLeft, width: cardW, boxSizing: 'border-box',
        background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, padding: 16,
        fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{s.title}</div>
        <p style={{ margin: '6px 0 12px', fontSize: 14, lineHeight: 1.45, color: 'var(--text-muted)' }}>{s.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{isLast ? 'Tap it to finish' : 'Tap the glowing spot'}</span>
          <button onClick={finish} style={{ minHeight: 44, padding: '0 8px', background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Skip tour</button>
        </div>
      </div>
    </div>
  );
}
