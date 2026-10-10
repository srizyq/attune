// Small beige chip for a stat delta/percentage/ratio/label (e.g. "21 LEFT",
// "TARGET 70 KG", "-0.4", "DAILY"). Always the same --chip-bg pill with small
// bold capitals; `tone` (accent/carbs/fat) or a raw `color` only changes the
// text colour — the macro hues the numbers are shown in elsewhere — so every
// chip in the app reads as one family. 'neutral' (the default) is plain
// secondary text on the chip.
const TINTS = {
  accent: 'var(--accent-secondary)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
};

export default function StatBadge({ tone = 'neutral', color, children, style }) {
  // `color` is an escape hatch for the many one-off metric colors that
  // don't have (and don't need) their own named tone — MicroCard already
  // carries a `color` per nutrient, so badges there just reuse it directly
  // instead of this file needing an ever-growing tone-per-nutrient map.
  const tint = color || TINTS[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: tint ? `color-mix(in srgb, ${tint} 70%, var(--text-primary))` : 'var(--text-secondary)',
      background: 'var(--chip-bg)',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}
