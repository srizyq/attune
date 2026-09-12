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
export default function MicroCard({ icon, label, value, unit, guideline, target, defaultTarget, color, locked, onUpgrade }) {
  const effectiveTarget = target || defaultTarget;
  const pct = effectiveTarget ? Math.min((value / effectiveTarget) * 100, 100) : null;
  return (
    <div
      onClick={locked ? onUpgrade : undefined}
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 18, position: 'relative', cursor: locked ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, background: color + '22', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', filter: locked ? 'blur(6px)' : 'none', userSelect: locked ? 'none' : 'auto' }}>
        {value}
        {target ? <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}> / {target}{unit}</span> : <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>}
      </div>
      {pct !== null ? (
        <>
          <div style={{ height: 5, background: 'var(--border-default)', borderRadius: 99, marginTop: 8, filter: locked ? 'blur(4px)' : 'none' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
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
    </div>
  );
}
