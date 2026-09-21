// "‹ Today ›" day switcher shared by Nutrients and Food search. A past day
// turns amber so it's obvious you're not looking at (or logging to) today.
export default function DateStepper({ selectedDate, isToday, onShift }) {
  const label = isToday
    ? 'Today'
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const btn = (disabled) => ({
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none',
    borderRadius: '50%', fontSize: 16, fontFamily: 'inherit',
    color: disabled ? 'var(--border-default)' : 'var(--text-muted)', cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: 22, padding: 2, flexShrink: 0,
      background: isToday ? 'var(--bg-card)' : '#1a1508', border: `1px solid ${isToday ? 'var(--border-default)' : '#4a3a1a'}`,
    }}>
      <button type="button" onClick={() => onShift(-1)} style={btn(false)} aria-label="Previous day"><i className="ti ti-chevron-left" /></button>
      <span style={{ minWidth: 84, textAlign: 'center', fontSize: 13, fontWeight: 600, color: isToday ? 'var(--text-secondary)' : 'var(--gold)' }}>{label}</span>
      <button type="button" onClick={() => onShift(1)} disabled={isToday} style={btn(isToday)} aria-label="Next day"><i className="ti ti-chevron-right" /></button>
    </div>
  );
}
