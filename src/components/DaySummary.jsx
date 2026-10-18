// Calories and macros for one day: a big calorie figure with a bar toward the
// target, and protein / carbs / fat each with their own bar. `compact` is the
// smaller version used on a friend's card. Targets may be missing, in which
// case the bar stays empty and only the eaten figure shows.
const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--macro-protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--macro-carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--macro-fat)' },
];

const pctOf = (value, target) => (target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0);
const g = (v) => `${Math.round(v * 10) / 10}`;

export default function DaySummary({ totals, targets, compact = false }) {
  const cal = Math.round(totals?.calories || 0);
  const calTarget = targets?.calories > 0 ? Math.round(targets.calories) : null;
  return (
    <div data-testid="day-summary">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: compact ? 20 : 30, letterSpacing: '-0.02em' }}>{cal.toLocaleString()}</span>
        <span style={{ fontSize: compact ? 12 : 14, color: 'var(--text-muted)' }}>{calTarget ? `/ ${calTarget.toLocaleString()} kcal` : 'kcal'}</span>
      </div>
      <div style={{ height: compact ? 5 : 8, borderRadius: 4, background: 'var(--border-default)', overflow: 'hidden', margin: compact ? '6px 0 10px' : '8px 0 16px' }}>
        <div style={{ height: '100%', width: `${pctOf(cal, calTarget)}%`, background: 'var(--accent)', transition: 'width 300ms ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? 8 : 14 }}>
        {MACROS.map((m) => {
          const value = totals?.[m.key] || 0;
          const target = targets?.[m.key] > 0 ? targets[m.key] : null;
          return (
            <div key={m.key} style={{ minWidth: 0 }}>
              <div style={{ fontSize: compact ? 13 : 16, fontWeight: 700, color: m.color }}>{g(value)}g</div>
              <div style={{ fontSize: compact ? 10 : 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}{target ? ` · ${Math.round(target)}g` : ''}</div>
              <div style={{ height: 3, borderRadius: 2, background: 'var(--border-default)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pctOf(value, target)}%`, background: m.color, transition: 'width 300ms ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
