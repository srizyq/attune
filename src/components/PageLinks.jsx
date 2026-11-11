import { useNavigate } from 'react-router-dom';

// A row of big, always-visible shortcuts at the top of a page (Friends ↔ Coach,
// Friends → Recipes). They are links to other pages, not tabs.
export default function PageLinks({ links }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Shortcuts" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      {links.map((l) => (
        <button
          key={l.to}
          type="button"
          className="btn-press"
          onClick={() => navigate(l.to)}
          style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 14, color: 'var(--accent)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <i className={`ti ${l.icon}`} aria-hidden="true" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
        </button>
      ))}
    </nav>
  );
}
