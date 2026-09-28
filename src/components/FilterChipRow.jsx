// A row of filter chips — an active, toggleable/clearable filter (e.g.
// "Needs attention") alongside passive count chips (e.g. "Active (8)"),
// shown together instead of a single dropdown value. No existing precedent
// in the app for this pattern; the chip visual language (accent-tinted
// pill, border-radius 20) matches the app's existing active-state pills
// (e.g. coach/shared.jsx's RangeToggle) so it reads as the same family.
//
//   <FilterChipRow>
//     <FilterChipRow.Chip active onClick={toggle} onClear={() => setOn(false)}>
//       Needs attention ({n})
//     </FilterChipRow.Chip>
//     <FilterChipRow.Chip>Active ({count})</FilterChipRow.Chip>
//   </FilterChipRow>
export default function FilterChipRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </div>
  );
}

// `active` tints the chip and makes it read as an applied filter. `onClear`
// adds a trailing ✕ (stops propagation so it clears without also
// re-triggering `onClick`'s toggle). Omit both `onClick`/`onClear` for a
// plain passive/informational count chip.
FilterChipRow.Chip = function Chip({ active = false, onClick, onClear, children }) {
  const interactive = !!onClick;
  return (
    <span
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      aria-pressed={interactive ? active : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        border: `1px solid ${active ? 'var(--accent-dark)' : 'var(--border-default)'}`,
        background: active ? 'var(--accent-bg)' : 'var(--bg-card)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: interactive ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {onClear && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ display: 'flex', background: 'none', border: 'none', padding: 0, margin: 0, color: 'inherit', cursor: 'pointer' }}
        >
          <i aria-hidden="true" className="ti ti-x" style={{ fontSize: 12 }} />
        </button>
      )}
    </span>
  );
};
