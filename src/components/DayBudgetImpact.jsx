// Shows what logging this item would do to today's remaining calorie
// budget — new to the app (no scan flow surfaced this before), so someone
// can see the effect of a log before committing to it instead of only
// finding out on the dashboard afterward.
export default function DayBudgetImpact({ target, consumed, adding, itemName }) {
  if (!target) return null;
  const before = Math.max(0, target - consumed);
  const after = Math.max(0, target - consumed - adding);
  const pctBefore = Math.min(100, (consumed / target) * 100);
  const pctAfter = Math.min(100, ((consumed + adding) / target) * 100);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Day budget impact</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {Math.round(before).toLocaleString()} kcal left <i className="ti ti-arrow-right" style={{ fontSize: 11, margin: '0 2px' }} /> {Math.round(after).toLocaleString()} kcal
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--border-default)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pctBefore}%`, background: 'var(--text-hint)' }} />
        <div style={{ position: 'absolute', inset: 0, width: `${pctAfter}%`, background: 'var(--accent)', transition: 'width 300ms ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{Math.round(consumed).toLocaleString()} kcal consumed</span>
        <span>+{Math.round(adding).toLocaleString()} kcal{itemName ? ` ${itemName}` : ''}</span>
        <span>Target: {Math.round(target).toLocaleString()} kcal</span>
      </div>
    </div>
  );
}
