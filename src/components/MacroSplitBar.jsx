// Average macro balance as one segmented bar (proportional by calories
// contributed — protein/carbs 4 kcal/g, fat 9 kcal/g) instead of a
// per-day stacked bar chart — the range's overall balance is what this
// is actually trying to show, not any single day. Shared with Coach.jsx.
export default function MacroSplitBar({ protein, carbs, fat }) {
  const proteinKcal = protein * 4;
  const carbsKcal = carbs * 4;
  const fatKcal = fat * 9;
  const total = proteinKcal + carbsKcal + fatKcal || 1;
  const segments = [
    { label: 'Protein', grams: protein, kcal: proteinKcal, color: '#8fbc8f' },
    { label: 'Carbs', grams: carbs, kcal: carbsKcal, color: '#6aabcf' },
    { label: 'Fat', grams: fat, kcal: fatKcal, color: '#9f97e8' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {segments.map(s => (
          <div key={s.label} title={`${s.label}: ${Math.round(s.grams)}g`} style={{ width: `${(s.kcal / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{Math.round(s.grams)}g</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
