// Small pill for a stat delta/percentage/ratio (e.g. weight change, macro %,
// "1476 left", water ratio). Tones reuse colors the app already has
// (accent/water-blue/ai-purple — the exact hues macro numbers are already
// shown in elsewhere) as a translucent tint, rather than a new color
// system — 'neutral' (the default) is the app's existing dark-pill look.
const TINTS = {
  accent: 'var(--accent)',
  carbs: 'var(--water-blue)',
  fat: 'var(--ai-purple)',
};

export default function StatBadge({ tone = 'neutral', children, style }) {
  const tint = TINTS[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700,
      color: tint || 'var(--text-secondary)',
      background: tint ? `color-mix(in srgb, ${tint} 18%, transparent)` : 'var(--bg-subtle)',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}
