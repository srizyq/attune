// A small segmented control: one option selected, 44px tall touch targets.
// Used for the Day / 7-day / 30-day and By type / By goal switches.
export default function SegToggle({ options, value, onChange, label, style }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 2, maxWidth: '100%', ...style }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value} type="button" aria-pressed={active} onClick={() => onChange(o.value)}
            style={{ minHeight: 40, padding: '0 12px', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
