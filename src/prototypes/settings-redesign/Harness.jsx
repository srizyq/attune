import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import GroupedListVariant from './GroupedListVariant';
import SearchHubVariant from './SearchHubVariant';
import CardHubVariant from './CardHubVariant';

// Isolated prototype harness — nothing here is imported by production
// code, and this file imports nothing from production pages either.
// Picker markup/styles/behavior are copied verbatim from PICKER.md; the
// only per-run values are the variant list itself. Transitions in these
// variants (accordion expand, card drill-down) trigger on interaction,
// not mount, so there's no entrance animation worth a replay button.

const VARIANTS = [
  { name: 'Grouped List', Component: GroupedListVariant },
  { name: 'Search Hub', Component: SearchHubVariant },
  { name: 'Card Hub', Component: CardHubVariant },
];

const PICKER_CSS = `
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}
.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}
.proto-picker-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}
.proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
.proto-picker-item:active { transform: scale(0.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, 0.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
`;

export default function Harness() {
  const [current, setCurrent] = useState(() => {
    const v = parseInt(new URLSearchParams(window.location.search).get('v'), 10);
    return v >= 1 && v <= VARIANTS.length ? v - 1 : 0;
  });
  const [remountKey, setRemountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef(null);
  const itemRefs = useRef([]);

  const moveHighlight = useCallback(() => {
    const picker = pickerRef.current;
    const el = itemRefs.current[current];
    const highlight = picker?.querySelector('.proto-picker-highlight');
    if (!el || !highlight) return;
    highlight.style.width = el.offsetWidth + 'px';
    highlight.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [current]);

  useLayoutEffect(() => { moveHighlight(); }, [moveHighlight]);

  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, []);

  useEffect(() => {
    const onResize = () => moveHighlight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [moveHighlight]);

  const setActive = useCallback((i) => {
    if (i < 0 || i >= VARIANTS.length) return;
    setCurrent(i);
    setRemountKey((k) => k + 1);
    const url = new URL(window.location);
    url.searchParams.set('v', i + 1);
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) setActive(num - 1);
      else if (e.key === 'ArrowRight') setActive((current + 1) % VARIANTS.length);
      else if (e.key === 'ArrowLeft') setActive((current - 1 + VARIANTS.length) % VARIANTS.length);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [current, setActive]);

  const Active = VARIANTS[current].Component;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto' }}>
      <style>{PICKER_CSS}</style>
      <div key={remountKey}>
        <Active />
      </div>
      <nav className="proto-picker" aria-label="Prototype variants" ref={pickerRef} data-ready={ready ? '' : undefined}>
        <span className="proto-picker-highlight" aria-hidden="true" />
        {VARIANTS.map((v, i) => (
          <button
            key={v.name}
            ref={(el) => { itemRefs.current[i] = el; }}
            className="proto-picker-item"
            data-active={i === current ? '' : undefined}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => setActive(i)}
          >
            {v.name}
          </button>
        ))}
      </nav>
    </div>
  );
}
