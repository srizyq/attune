export default function WeightSparkline({ points, color }) {
  if (points.length < 2) return null;
  const w = 240, h = 56, pad = 6;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const norm = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const coords = points.map((v, i) => [(i / (points.length - 1)) * w, norm(v)]);
  const linePts = coords.map(p => p.join(',')).join(' ');
  const areaPts = `0,${h} ${linePts} ${w},${h}`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }}>
      <polygon points={areaPts} fill={color} opacity="0.08" />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--bg-card)" stroke={color} strokeWidth="2" />
    </svg>
  );
}
