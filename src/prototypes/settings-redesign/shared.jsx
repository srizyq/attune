import Slider from '../../components/Slider';

// Small local re-implementations of Settings.jsx's own primitives (Card,
// Toggle, Segmented, etc.) — they aren't exported from that file, and
// touching production code to export them isn't in scope for a layout
// exploration. Real Slider is reused as-is since it's already generic.
export { Slider };

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
      borderRadius: '16px', padding: '20px', ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
      {children}
    </p>
  );
}

export function Toggle({ on, onChange }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      style={{
        width: '44px', height: '26px', borderRadius: '99px', flexShrink: 0,
        border: `1px solid ${on ? 'var(--accent-dark)' : 'var(--border-default)'}`,
        background: on ? '#4a7a4a33' : 'var(--bg-primary)',
        position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: on ? '20px' : '2px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: on ? 'var(--accent)' : 'var(--text-muted)', transition: 'left 0.2s',
      }} />
    </button>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(o => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: '1 1 auto', minWidth: '110px', padding: '12px 14px',
              background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
              border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
              borderRadius: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <i className={`ti ${o.icon}`} style={{ fontSize: '18px', marginBottom: '4px', display: 'block', color: sel ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div style={{ color: sel ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{o.label}</div>
            {o.desc && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{o.desc}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-default)' }}>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export function AVATAR({ initials = 'S' }) {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-dark)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'var(--accent)',
      flexShrink: 0, fontFamily: "'Syne', sans-serif",
    }}>
      {initials}
    </div>
  );
}
