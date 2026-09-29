// Small pill for a stat delta/percentage/ratio (e.g. weight change, macro %,
// "1476 left", water ratio) — the app's existing neutral pill look
// (--pill-track/--pill-text, same as StreakItem etc.), just reused here as
// a shared component instead of hand-rolled per file. No tone/color
// variants — this is a layout primitive, not a new color system.
export default function StatBadge({ children, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700,
      color: 'var(--text-secondary)', background: 'var(--bg-subtle)', whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}
