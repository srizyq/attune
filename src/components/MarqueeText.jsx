import { useRef, useLayoutEffect } from 'react';

// A name that clips to a single line with an ellipsis when it doesn't
// actually fit — used anywhere a food/item name would otherwise wrap or
// get cut off (LogItemRow's daily log, FoodSearch's results). Re-measures
// on text change and window resize (rotating a phone can turn a fit into
// an overflow). onOverflowChange lets a caller show the full name
// elsewhere (e.g. once a row expands) only when it was actually clipped
// here — this used to also drive a scrolling marquee animation on the
// clipped text itself, but that read as distracting rather than helpful
// (an ellipsis already signals "there's more"), so it was removed; the
// overflow measurement/callback stayed since other rows still depend on
// it to know when to show the full name.
export default function MarqueeText({ text, style, className, onOverflowChange }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const el = textRef.current;
      if (!container || !el) return;
      const next = Math.max(0, el.scrollWidth - container.clientWidth);
      onOverflowChange?.(next);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOverflowChange is a fresh closure every render; re-running on it would defeat the point of measuring only on text/resize changes.
  }, [text]);

  return (
    <div ref={containerRef} className={className} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
      <span
        ref={textRef}
        style={{
          ...style,
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          verticalAlign: 'top',
        }}
      >
        {text}
      </span>
    </div>
  );
}
