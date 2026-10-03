// Shows what logging this item would do to today's remaining calorie
// budget before committing to it, instead of only finding out on the
// dashboard afterward. Shared by the barcode, photo and menu scans.
//
// The bar is drawn against whichever is bigger — the target or the total
// you'd reach — so going over is visible ON the bar: it fills to the end,
// a tick marks where the target was, and the part past it turns red.

// Negative remaining reads as "N kcal over" instead of clamping to a
// misleading "0 kcal left" — going over the target is exactly the thing
// this card exists to surface, not hide.
function formatBudget(remaining) {
  const n = Math.round(Math.abs(remaining)).toLocaleString();
  return remaining < 0 ? `${n} kcal over` : `${n} kcal left`;
}

const pill = (color) => ({
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: 8,
  fontWeight: 600,
  color: `var(--${color})`,
  background: `color-mix(in srgb, var(--${color}) 14%, transparent)`,
  border: `1px solid color-mix(in srgb, var(--${color}) 35%, transparent)`,
});

export default function DayBudgetImpact({ target, consumed, adding }) {
  if (!target) return null;
  const total = consumed + adding;
  const remainingBefore = target - consumed;
  const remainingAfter = target - total;
  const over = remainingAfter < 0;

  // Everything is a share of `scale`, so the bar never overflows and the
  // target tick sits at target/total of the way along once you're over.
  const scale = Math.max(target, total, 1);
  const pct = (n) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;
  const consumedEnd = Math.min(consumed, target);
  const addedEnd = Math.min(total, target);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Day budget impact</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          {formatBudget(remainingBefore)} <i className="ti ti-arrow-right" aria-hidden="true" style={{ fontSize: 11 }} />
          {over ? <span style={{ ...pill('danger'), fontSize: 12 }}>{formatBudget(remainingAfter)}</span> : formatBudget(remainingAfter)}
        </span>
      </div>

      <div style={{ position: 'relative', height: 8, marginBottom: 12 }} data-testid="budget-bar">
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'var(--border-default)', overflow: 'hidden' }}>
          {/* Already eaten today, then what this log adds (up to the target), then the part past it. */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: pct(addedEnd), background: 'var(--accent)', transition: 'width 300ms ease' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: pct(consumedEnd), background: 'color-mix(in srgb, var(--accent) 65%, #000)', transition: 'width 300ms ease' }} />
          {over && (
            <div data-testid="budget-over" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(target), right: 0, background: 'var(--danger)' }} />
          )}
        </div>
        {over && (
          <div aria-hidden="true" style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${pct(target)} - 1px)`, width: 2, borderRadius: 1, background: 'var(--text-primary)' }} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{Math.round(consumed).toLocaleString()} kcal consumed</span>
        <span style={{ ...pill('accent'), fontSize: 11, textAlign: 'center' }}>Total: {Math.round(total).toLocaleString()} kcal</span>
        <span style={{ textAlign: 'right' }}>Target: {Math.round(target).toLocaleString()} kcal</span>
      </div>
    </div>
  );
}
