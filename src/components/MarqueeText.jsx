import { useState, useRef, useLayoutEffect } from 'react';

const PX_PER_SEC = 28;
const MIN_MS = 3200;
const MAX_MS = 11000;

// A name that scrolls in place, single line, only when it doesn't actually
// fit — used anywhere a food/item name would otherwise wrap or get cut off
// (LogItemRow's daily log, FoodSearch's results). Re-measures on text
// change and window resize (rotating a phone can turn a fit into an
// overflow). onOverflowChange lets a caller show the full name elsewhere
// (e.g. once a row expands) only when it was actually clipped here.
export default function MarqueeText({ text, style, className, onOverflowChange }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const el = textRef.current;
      if (!container || !el) return;
      const next = Math.max(0, el.scrollWidth - container.clientWidth);
      setOverflow(next);
      onOverflowChange?.(next);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOverflowChange is a fresh closure every render; re-running on it would defeat the point of measuring only on text/resize changes.
  }, [text]);

  const durationMs = overflow > 0
    ? Math.min(MAX_MS, Math.max(MIN_MS, (overflow / PX_PER_SEC) * 1000))
    : 0;

  return (
    <div ref={containerRef} className={className} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
      <span
        ref={textRef}
        className={overflow > 0 ? 'food-name-marquee' : ''}
        style={{
          ...style,
          ...(overflow > 0
            ? { '--marquee-distance': `-${overflow}px`, '--marquee-duration': `${durationMs}ms` }
            : { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' }),
        }}
      >
        {text}
      </span>
    </div>
  );
}
