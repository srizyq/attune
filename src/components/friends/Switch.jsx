// A labelled on/off row (a native checkbox with role="switch", so it is
// keyboard and screen-reader friendly).
export default function Switch({ id, checked, onChange, title, disabled, children }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15 }}>{title}</span>
        {children && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>{children}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 26, height: 26, minWidth: 26, minHeight: 26, flexShrink: 0, accentColor: 'var(--accent)' }} />
    </label>
  );
}
