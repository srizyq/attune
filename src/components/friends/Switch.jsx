// A labelled on/off row (a native checkbox with role="switch", drawn as a
// toggle by .switch-input in index.css, so it stays keyboard and
// screen-reader friendly).
export default function Switch({ id, checked, onChange, title, disabled, children }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15 }}>{title}</span>
        {children && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>{children}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="switch-input" />
    </label>
  );
}
