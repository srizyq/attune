// Stacked, full-width form pattern — an input (or any field) on its own
// row, then a full-width action button below it, instead of the side-by-
// side "input + adjacent button" row used throughout the app today. Each
// child stacks full-width with a consistent gap; pass the field(s) first,
// then a <FormRow.Button> last.
//
//   <FormRow>
//     <input style={{ width: '100%', ... }} placeholder="Who's it for? (optional)" />
//     <FormRow.Button icon="ti-send" primary onClick={handleCreate}>Create invite</FormRow.Button>
//   </FormRow>
export default function FormRow({ children, gap = 8 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {children}
    </div>
  );
}

// Same visual family as the `btn()` helpers duplicated across coach
// components (padding, radius, weight, font) — centered icon+label, full
// width, instead of a content-width button that only made sense sitting
// next to an input.
// `danger` marks a destructive action (delete/remove/disconnect) — red
// text/border instead of the accent color, same signal those actions
// carried before they moved off inline icon buttons into a modal/detail
// view's button row.
FormRow.Button = function FormRowButton({ icon, primary = false, danger = false, disabled = false, children, onClick, type = 'button' }) {
  const color = disabled ? 'var(--text-muted)' : primary ? 'var(--accent-contrast)' : danger ? 'var(--danger)' : 'var(--accent)';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="btn-press"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        background: disabled ? 'var(--border-default)' : primary ? 'var(--accent)' : 'transparent',
        border: `1px solid ${disabled ? 'var(--border-default)' : primary ? 'var(--accent)' : danger ? 'var(--danger)' : 'var(--border-default)'}`,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 14 }} />}
      {children}
    </button>
  );
};
