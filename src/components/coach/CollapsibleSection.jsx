// A row that opens a section: closed it's one tappable line, open it's the line
// plus what it holds. For things a coach needs now and then (inviting a client),
// so they stop taking half a phone screen the rest of the time.
export default function CollapsibleSection({ id, title, icon, badge, open, onToggle, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="btn-press"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 56, padding: '0 20px', marginBottom: open ? 12 : 0, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'left' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {icon && <i className={`ti ${icon}`} aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 18 }} />}
          {title}
          {badge ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-secondary)' }}>{badge}</span> : null}
        </span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
      </button>
      {open && <div id={`${id}-body`}>{children}</div>}
    </section>
  );
}
