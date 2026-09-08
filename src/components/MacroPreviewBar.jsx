// Shared between Settings.jsx (the user's own target editor) and
// Coach.jsx (a trainer setting a client's targets) — same live-preview
// bar either way: grams, resulting calories, and share of the total.
export default function MacroPreviewBar({ label, grams, calories, pct, color }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{grams}g</span> · {calories} kcal · {Math.round(pct * 100)}%
        </span>
      </div>
      <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}
