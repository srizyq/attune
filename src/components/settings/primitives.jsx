// Shared building blocks used across the Settings page, the Goals &
// Targets full page, and the Notifications/Coach/Account popups —
// previously private to Settings.jsx, now needed in all of them since
// the page split into multiple files.
export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border-default)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px' }}>
      {children}
    </p>
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

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '9px 12px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        fontSize: '14px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        outline: 'none',
        cursor: 'pointer',
        minWidth: '160px',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Grid, not flex-wrap — flex-wrap with a fixed minWidth per option looks
// fine until the row is narrow enough that the last option can't fit
// (a phone screen, with 3 options here), at which point it wraps alone
// onto its own row and stretches to fill it — two options end up half-
// width, the third full-width, with no visual reason for the mismatch.
// A grid with exactly `options.length` equal columns can't do that: all
// options are always the same width, whether that's roomy (desktop) or
// tight (phone), matching how Dashboard's own 3-across row (.grid-3-fixed
// in appshell.css) already solves this same problem.
export function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: '8px' }}>
      {options.map(o => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '14px 12px',
              background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
              border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <i className={`ti ${o.icon}`} style={{ fontSize: '20px', marginBottom: '4px', display: 'block', color: sel ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div style={{ color: sel ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{o.label}</div>
            {o.desc && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{o.desc}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: '44px', height: '26px',
        borderRadius: '99px',
        border: `1px solid ${on ? 'var(--accent-dark)' : 'var(--border-default)'}`,
        background: on ? '#4a7a4a33' : 'var(--bg-primary)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '2px',
        left: on ? '20px' : '2px',
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: on ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

// Modal chrome shared by Notifications/Coach/Account — reuses the app's
// existing .modal-backdrop/.modal-panel animation classes (same ones the
// logout-confirm dialog and photo-scan modals already use) so these read
// as the same kind of popup as everywhere else, not a one-off.
export function SettingsModal({ title, onClose, closing, children }) {
  return (
    <div
      onClick={onClose}
      className={`modal-backdrop${closing ? ' is-closing' : ''}`}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--bg-subtle)', zIndex: 1 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
