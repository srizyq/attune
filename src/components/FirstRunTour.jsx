import { useCallback, useEffect, useRef, useState } from 'react';

// A short guided tour of the Dashboard: dims the screen, lights up one thing at
// a time with a one-line explanation, and moves on when the person taps anywhere on the
// screen. Taps are caught by the overlay (nothing underneath is really pressed), so
// nothing gets logged or opened by accident. Targets are found by data-tour="…"
// markers; a step whose target isn't on screen (e.g. Slots for a free account) is skipped.
import ModalPortal from './ModalPortal';
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
  const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  const onOverlayTap = () => {
    const n = nextFrom(step);
    if (n < 0) finish(); else setStep(n);
  };

  // One dot per step that is actually on this screen (Slots is Pro-only).
  const shown = STEPS.map((st, i) => (i === step || findTarget(st.sel) ? i : -1)).filter((i) => i >= 0);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(320, vw - 32);
  const below = hole.top + hole.height + 12 + 140 < vh;
  const cardTop = below ? hole.top + hole.height + 12 : Math.max(70, hole.top - 12 - 140);
  const cardLeft = Math.min(Math.max(16, hole.left + hole.width / 2 - cardW / 2), vw - cardW - 16);

  return (
    <ModalPortal>
    <div role="dialog" aria-modal="true" aria-label="App tour" onClick={onOverlayTap} style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <div aria-hidden="true" style={{
        position: 'fixed', top: hole.top, left: hole.left, width: hole.width, height: hole.height,
        borderRadius: 16, boxShadow: '0 0 0 9999px color-mix(in srgb, var(--bg-primary) 88%, transparent)', border: '2px dashed var(--accent)',
        pointerEvents: 'none', transition: 'all 200ms ease',
      }} />
      <button onClick={(e) => { e.stopPropagation(); finish(); }} style={{
        position: 'fixed', top: 'calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 12px)', right: 16, minHeight: 44, padding: '0 8px',
        background: 'none', border: 'none', color: 'var(--text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>Skip</button>
      <div style={{
        position: 'fixed', top: cardTop, left: cardLeft, width: cardW, boxSizing: 'border-box', textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', sans-serif", pointerEvents: 'none', textShadow: '0 1px 10px var(--bg-primary)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{s.title}</div>
        <p style={{ margin: '6px 0 14px', fontSize: 14, lineHeight: 1.45, color: 'var(--text-muted)' }}>{s.body}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }} aria-label={`Step ${shown.indexOf(step) + 1} of ${shown.length}`}>
          {shown.map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 99, background: i === step ? 'var(--accent)' : 'color-mix(in srgb, var(--text-primary) 25%, transparent)' }} />)}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
