// Pro-only choice between the hourly timeline and the meal-grouped view
// (Breakfast/Lunch/Dinner/Snacks) — shared between Dashboard's daily log
// and the full /log page so picking one on either page shows up on both,
// since both read the same profile.daily_log_view field rather than
// keeping page-local state.
export default function DailyLogViewToggle({ value, onChange, fill = false }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2, flexShrink: 0, ...(fill ? { width: '100%', maxWidth: 360 } : null) }}>
      {[
        { id: 'hourly', label: 'Hourly', icon: 'ti-clock' },
        { id: 'meals', label: 'Meals', icon: 'ti-list' },
      ].map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: fill ? '9px 12px' : '6px 12px', borderRadius: 18, border: 'none', ...(fill ? { flex: 1 } : null),
            background: value === opt.id ? 'var(--accent)' : 'transparent',
            color: value === opt.id ? '#0f0f0f' : 'var(--text-muted)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <i className={`ti ${opt.icon}`} style={{ fontSize: 13 }} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
