// A macro grid with a mini progress bar under each stat — replaces the
// four independently copy-pasted "kcal/protein/carbs/fat, no bars" grids
// (FoodSearch's BarcodeScanner, PhotoScanModal, MenuScanModal's MacroGrid,
// RecalculatePhotoModal). The bar under each macro fills toward that
// macro's share of `dailyTarget` when one is supplied (the day's actual
// budget for that nutrient) — omit `dailyTarget` (or a field of it) to
// render the bar unfilled, e.g. for a plain estimate with no target context.
const FIELDS = [
  { key: 'cal', label: 'kcal', color: 'var(--accent)', unit: '' },
  { key: 'protein', label: 'Protein', color: 'var(--macro-protein)', unit: 'g' },
  { key: 'carbs', label: 'Carbs', color: 'var(--water-blue)', unit: 'g' },
  { key: 'fat', label: 'Fat', color: 'var(--warning)', unit: 'g' },
];

export default function MacroBreakdown({ values, dailyTarget }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {FIELDS.map(f => {
        const value = values?.[f.key];
        const target = dailyTarget?.[f.key];
        const pct = target ? Math.max(0, Math.min(100, (Number(value) / target) * 100)) : 0;
        return (
          <div key={f.key} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: f.color }}>{value ?? 0}{f.unit}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{f.label}</div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border-default)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: f.color, transition: 'width 300ms ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
