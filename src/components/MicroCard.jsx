import Card from './Card';
import StatBadge from './StatBadge';

// Shared between Nutrients.jsx (the user's own micronutrient breakdown)
// and Coach.jsx (a trainer viewing a client's) — same card either way.
// `locked` blurs the value/guideline and overlays a lock badge instead of
// hiding the card entirely — free users see exactly what's on offer
// (label, icon, guideline) without the actual number, then tap through
// to Settings to upgrade rather than wondering why a nutrient vanished.
//
// `target` (a Pro-only custom target) always wins when set; otherwise
// `defaultTarget` (a standard RDI figure — see lib/microNutrients.js)
// draws the same progress bar against a sensible guideline instead of
// falling back to plain guideline text. Only nutrients with neither (the
// two whose guideline isn't a number at all — "as low as possible",
// "favour over saturated fat") show text instead of a bar.
//
// `noData` (none of the logged foods carried this nutrient) shows a dash
// instead of a misleading 0; `approx` puts a "~" on a total that includes
// estimates; `note` is the small line saying how much of it was measured.
export default function MicroCard({ icon, label, value, unit, guideline, target, defaultTarget, color, locked, onUpgrade, note, noData = false, approx = false }) {
  const effectiveTarget = target || defaultTarget;
  const pct = effectiveTarget && !noData ? (value / effectiveTarget) * 100 : null;
  const barPct = pct !== null ? Math.min(pct, 100) : null;
  return (
    <Card
      onClick={locked ? onUpgrade : undefined}
      style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 18, marginBottom: 0, position: 'relative', cursor: locked ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 28, height: 28, flexShrink: 0, background: color + '22', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        {pct !== null && !locked && (
          <StatBadge color={color} style={{ padding: '2px 6px', fontSize: 11 }}>{Math.round(pct)}%</StatBadge>
        )}
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', filter: locked ? 'blur(6px)' : 'none', userSelect: locked ? 'none' : 'auto' }}>
        {noData ? '—' : <>{approx ? '~' : ''}{value}</>}
        {noData ? null : target ? <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}> / {target}{unit}</span> : <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{unit}</span>}
      </div>
      {note && <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 3, lineHeight: 1.35, filter: locked ? 'blur(4px)' : 'none' }}>{note}</div>}
      {pct !== null ? (
        <>
          <div style={{ height: 5, background: 'var(--border-default)', borderRadius: 99, marginTop: 8, filter: locked ? 'blur(4px)' : 'none' }}>
            <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          {/* A custom target already reads as a target in the value line
              above ("12g / 25g") — the default-guideline case has no such
              context, so it still needs the guideline text alongside the
              bar to explain what's being measured against. */}
          {!target && <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 4, filter: locked ? 'blur(4px)' : 'none' }}>{guideline}</div>}
        </>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, filter: locked ? 'blur(4px)' : 'none' }}>{guideline}</div>
      )}
      {locked && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 11 }}>
          <i className="ti ti-lock" />
        </div>
      )}
    </Card>
  );
}
