// Generic equal-split pill toggle — full-width by default (each option gets
// `flex: 1`, evenly splitting the container) rather than sizing to its
// content and sitting wherever its container's flex layout puts it. Pass
// `fill={false}` for the old compact/content-width behavior where a control
// genuinely shouldn't stretch (e.g. a small inline toggle next to other
// controls in the same row).
//
// Generalizes DailyLogViewToggle's `fill` prop, which proved this exact
// mechanic (bg-primary track, accent/accent-contrast active pill) already —
// DailyLogViewToggle now wraps this instead of duplicating it.
//
// Plain buttons (aria-pressed) by default — most call sites (a view toggle,
// a theme/units switch, a date-range picker) are not tabs, and giving every
// one role="tab" broke every test/query that found them as ordinary buttons.
// Pass `asTabs` only where the options genuinely swap between separate
// panels (e.g. MessagesTab's "Messages to client" / "Private notes"), which
// is the one call site that had real role="tablist"/"tab" semantics before
// this component existed.
export default function SegmentedControl({ options, value, onChange, fill = true, style, asTabs = false, ariaLabel }) {
  return (
    <div
      role={asTabs ? 'tablist' : undefined}
      aria-label={asTabs ? ariaLabel : undefined}
      style={{
        display: 'flex', gap: 4, background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)', borderRadius: 20, padding: 2,
        ...(fill ? { width: '100%' } : { flexShrink: 0 }),
        ...style,
      }}
    >
      {options.map(opt => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            role={asTabs ? 'tab' : undefined}
            aria-selected={asTabs ? active : undefined}
            aria-pressed={asTabs ? undefined : active}
            onClick={() => { if (!opt.disabled) onChange(opt.id); }}
            className="btn-press"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: fill ? '9px 12px' : '6px 12px', borderRadius: 18, border: 'none',
              ...(fill ? { flex: 1 } : null),
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600, cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.5 : 1,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {opt.icon && <i aria-hidden="true" className={`ti ${opt.icon}`} style={{ fontSize: 13 }} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
