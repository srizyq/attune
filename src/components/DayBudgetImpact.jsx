// Shows what logging this item would do to today's remaining calorie
// budget — new to the app (no scan flow surfaced this before), so someone
// can see the effect of a log before committing to it instead of only
// finding out on the dashboard afterward.

// Negative remaining reads as "N kcal over" instead of clamping to a
// misleading "0 kcal left" — going over the target is exactly the thing
// this card exists to surface, not hide.
function formatBudget(remaining) {
  const n = Math.round(Math.abs(remaining)).toLocaleString();
  return remaining < 0 ? `${n} kcal over` : `${n} kcal left`;
}

export default function DayBudgetImpact({ target, consumed, adding }) {
  if (!target) return null;
  const total = consumed + adding;
  const remainingBefore = target - consumed;
  const remainingAfter = target - total;
  const over = remainingAfter < 0;
  const pctBefore = Math.min(100, (consumed / target) * 100);
  const pctAfter = Math.min(100, (total / target) * 100);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Day budget impact</span>
        <span style={{ fontSize: 12, color: over ? 'var(--danger)' : 'var(--text-secondary)' }}>
          {formatBudget(remainingBefore)} <i className="ti ti-arrow-right" style={{ fontSize: 11, margin: '0 2px' }} /> {formatBudget(remainingAfter)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--border-default)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pctBefore}%`, background: 'var(--text-hint)' }} />
        <div style={{ position: 'absolute', inset: 0, width: `${pctAfter}%`, background: over ? 'var(--danger)' : 'var(--accent)', transition: 'width 300ms ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{Math.round(consumed).toLocaleString()} kcal consumed</span>
        <span style={{ color: over ? 'var(--danger)' : 'var(--text-muted)', fontWeight: over ? 600 : 400 }}>Total: {Math.round(total).toLocaleString()} kcal</span>
        <span>Target: {Math.round(target).toLocaleString()} kcal</span>
      </div>
    </div>
  );
}
