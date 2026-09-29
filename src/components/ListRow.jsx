// Generic tappable list row — square-ish avatar/icon slot, title, a richer
// multi-stat subtitle (parts joined by "•"), and a trailing accessory
// (chevron / badge / dot), replacing per-file bespoke rows that mixed a
// circular avatar, a single-stat subtitle, and inline icon actions in the
// row itself. The whole row is the tap target; anything that used to be an
// inline row action (tag/remove icons, etc.) belongs in the destination
// this row now navigates to, not in the row.
//
//   <ListRow
//     avatar={<ListRow.SquareAvatar initials="T" pct={0.6} />}
//     title="Tarun"
//     subtitleParts={['283 kcal today', 'Target: 2,420']}
//     trailing={<ListRow.Chevron />}
//     onClick={() => onSelect(client)}
//   />
export default function ListRow({ avatar, title, subtitleParts = [], trailing, onClick }) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      className={interactive ? 'btn-press' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
        borderBottom: '1px solid var(--border-default)',
        cursor: interactive ? 'pointer' : 'default', width: '100%',
      }}
    >
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {subtitleParts.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitleParts.filter(Boolean).join(' • ')}
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}

// Square (rounded) avatar with the same initials + progress-ring mechanic
// as coach/shared.jsx's ClientAvatar, adapted to a rounded-square tile
// instead of a circle — that component stays circular as-is since
// ClientDetail's header also uses it standalone; this is ListRow's own
// square rendering of the same idea; `pct` is optional (omit for a plain
// icon/initials tile, e.g. team members). Pass `name` for auto-computed
// initials (matching ClientAvatar's ergonomics), or `initials` directly.
ListRow.SquareAvatar = function SquareAvatar({ name, initials, icon, pct, size = 44 }) {
  const computedInitials = initials || (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const clamped = pct == null ? null : Math.max(0, Math.min(1, pct));
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0, borderRadius: 12,
      background: 'var(--bg-card)', border: `1px solid ${clamped != null ? 'var(--accent)' : 'var(--border-default)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {clamped != null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: `${clamped * 100}%`,
          background: 'var(--accent-bg)', transition: 'height 400ms cubic-bezier(0.23, 1, 0.32, 1)',
        }} />
      )}
      <div style={{ position: 'relative', fontSize: icon ? size * 0.45 : size * 0.32, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Syne', sans-serif" }}>
        {icon ? <i aria-hidden="true" className={`ti ${icon}`} /> : computedInitials}
      </div>
    </div>
  );
};

ListRow.Chevron = function Chevron() {
  return <i aria-hidden="true" className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--text-hint)', flexShrink: 0 }} />;
};

// Numeric/text badge (e.g. an adherence score) with an optional trailing
// chevron alongside it — badge + chevron is a common combo in the
// reference (a value plus "this row opens something").
ListRow.Badge = function Badge({ children, tone = 'default', withChevron = false }) {
  const color = tone === 'warning' ? 'var(--warning)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Syne', sans-serif" }}>{children}</span>
      {withChevron && <ListRow.Chevron />}
    </div>
  );
};

// Small status dot (e.g. "has an unread update") with an optional chevron —
// the dot-only trailing accessory seen in the reference for rows that just
// need a glance-able status marker rather than a value.
ListRow.Dot = function Dot({ color = 'var(--accent)', withChevron = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {withChevron && <ListRow.Chevron />}
    </div>
  );
};
