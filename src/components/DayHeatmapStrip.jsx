// A row of fixed-height cells whose color intensity (not height) encodes
// each day's value — deliberately not a line/bar chart. Height-encodes-
// value is exactly what makes a bar chart read as a "chart" (axes, scale,
// legend); a heatmap strip reads as a calendar/streak-style overview
// instead, which is what replaced Expenditure's Chart.js line/bar
// visualizations here. Shared with Coach.jsx so a trainer's view of a
// client's data renders identically.
//
// `days` is [{ date, pct, tooltip }] — pct (0-100, or null for "no data")
// is already computed by the caller, since what "100%" means differs by
// metric (calories vs goal, TDEE vs its own range max, etc.).
export default function DayHeatmapStrip({ days, color = 'var(--accent)', maxCells = 60, height = 44 }) {
  const cells = days.length > maxCells ? bucketize(days, maxCells) : days;

  return (
    <div style={{ display: 'flex', gap: 2, height }}>
      {cells.map((d, i) => (
        <div
          key={d.date || i}
          title={d.tooltip || undefined}
          style={{
            flex: 1, minWidth: 2, height: '100%', borderRadius: 3,
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            position: 'relative', overflow: 'hidden', cursor: d.tooltip ? 'default' : undefined,
          }}
        >
          {d.pct != null && (
            <div style={{ position: 'absolute', inset: 0, background: color, opacity: Math.max(0.12, Math.min(1, d.pct / 100)) }} />
          )}
        </div>
      ))}
    </div>
  );
}

// Averages consecutive days into ~maxCells buckets so a 6M/1Y/All range
// doesn't render hundreds of slivers too thin to see or hover — each
// bucket's pct is the mean of its days that actually had data.
function bucketize(days, maxCells) {
  const bucketSize = Math.ceil(days.length / maxCells);
  const buckets = [];
  for (let i = 0; i < days.length; i += bucketSize) {
    const slice = days.slice(i, i + bucketSize);
    const withData = slice.filter(d => d.pct != null);
    const pct = withData.length ? withData.reduce((s, d) => s + d.pct, 0) / withData.length : null;
    buckets.push({
      date: slice[0].date,
      pct,
      tooltip: `${slice[0].date}${slice.length > 1 ? ` – ${slice[slice.length - 1].date}` : ''}${pct != null ? ` · ${Math.round(pct)}%` : ''}`,
    });
  }
  return buckets;
}
