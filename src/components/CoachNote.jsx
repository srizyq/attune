// A trainer's comment surfaced on the client's own pages — same card
// wherever it appears (Dashboard, Progress, Daily Log), so a coach's note
// always reads the same regardless of which page it landed on.
function relativeLabel(iso) {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString();
}

// `onClick` (used for the two-way 'general' note on Dashboard) makes the
// whole card a button that opens the full chat thread — everywhere else
// (Progress, Daily Log) it's just a static one-way annotation.
export default function CoachNote({ note, onDismiss, onClick, style }) {
  if (!note) return null;
  const initials = (note.trainer?.name || 'Coach').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      onClick={onClick}
      className={onClick ? 'btn-press' : undefined}
      style={{
        background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 12,
        padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
        cursor: onClick ? 'pointer' : 'default', ...style,
      }}
    >
      {note.trainer?.coach_logo_url ? (
        <img
          src={note.trainer.coach_logo_url}
          alt=""
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-active)', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-active)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          color: 'var(--accent)', fontFamily: "'Syne', sans-serif", flexShrink: 0,
        }}>
          {initials}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Coach {note.trainer?.name || ''}</span>
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>· {relativeLabel(note.created_at)}</span>
          {onClick && <span style={{ fontSize: 11, color: 'var(--text-hint)', marginLeft: 'auto', marginRight: onDismiss ? 8 : 0 }}>Reply →</span>}
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{note.body}</p>
      </div>
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 0, lineHeight: 1 }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
