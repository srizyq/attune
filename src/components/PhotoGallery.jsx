import { useEffect, useState } from 'react';

const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const ghost = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };

function Modal({ label, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()} className="modal-panel" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 16, width: '100%', maxWidth: wide ? 900 : 520, maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function Picture({ photo, url, style }) {
  return url
    ? <img src={url} alt={`Progress photo from ${fmt(photo.taken_date)}`} style={{ display: 'block', width: '100%', borderRadius: 10, ...style }} />
    : <div style={{ aspectRatio: '3 / 4', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', borderRadius: 10, color: 'var(--text-hint)', fontSize: 12 }}>Photo unavailable</div>;
}

// A grid of progress photos with a full-size viewer and a side-by-side compare
// (pick two, oldest on the left). `onDelete` present = the owner's view; a
// coach's is read-only. Photo links arrive pre-signed (short-lived, private
// bucket) in `urls`, keyed by storage path.
export default function PhotoGallery({ photos, urls, onDelete, emptyText = 'No photos yet.' }) {
  const [viewing, setViewing] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (photos.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{emptyText}</p>;

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]));
  const pair = selected.map((id) => photos.find((p) => p.id === id)).filter(Boolean).sort((a, b) => a.taken_date.localeCompare(b.taken_date));

  const handleDelete = async (photo) => {
    if (!window.confirm('Delete this photo? This can’t be undone.')) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(photo);
      setViewing(null);
    } catch (err) {
      setError(err.message || 'Couldn’t delete that photo — try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button onClick={() => { setSelecting(s => !s); setSelected([]); }} aria-pressed={selecting} className="btn-press" style={{ ...ghost, color: selecting ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {selecting ? 'Cancel compare' : 'Compare two'}
          </button>
          {selecting && (
            <button onClick={() => setComparing(true)} disabled={selected.length !== 2} className="btn-press" style={{ ...ghost, background: 'var(--accent)', border: '1px solid var(--accent)', color: '#0f0f0f', opacity: selected.length === 2 ? 1 : 0.5 }}>
              Compare ({selected.length}/2)
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map(p => {
          const picked = selected.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => (selecting ? toggle(p.id) : setViewing(p))}
              aria-label={`${selecting ? (picked ? 'Deselect' : 'Select') : 'Open'} photo from ${fmt(p.taken_date)}`}
              aria-pressed={selecting ? picked : undefined}
              className="btn-press"
              style={{ position: 'relative', padding: 0, background: 'var(--bg-card)', border: `2px solid ${picked ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', textAlign: 'left' }}
            >
              {urls[p.path]
                ? <img src={urls[p.path]} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' }} />
                : <div style={{ aspectRatio: '3 / 4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)' }}><i className="ti ti-photo" style={{ fontSize: 24 }} /></div>}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 6px', fontSize: 11, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>{fmt(p.taken_date)}</span>
            </button>
          );
        })}
      </div>

      {viewing && (
        <Modal label={`Photo from ${fmt(viewing.taken_date)}`} onClose={() => setViewing(null)}>
          <Picture photo={viewing} url={urls[viewing.path]} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(viewing.taken_date)}</div>
              {viewing.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{viewing.note}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {onDelete && <button onClick={() => handleDelete(viewing)} disabled={deleting} className="btn-press" style={{ ...ghost, color: 'var(--danger)' }}>{deleting ? 'Deleting…' : 'Delete'}</button>}
              <button onClick={() => setViewing(null)} className="btn-press" style={ghost}>Close</button>
            </div>
          </div>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
        </Modal>
      )}

      {comparing && pair.length === 2 && (
        <Modal label="Compare photos" wide onClose={() => setComparing(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {pair.map((p, i) => (
              <figure key={p.id} style={{ margin: 0 }}>
                <Picture photo={p} url={urls[p.path]} />
                <figcaption style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>{i === 0 ? 'Before' : 'After'} · {fmt(p.taken_date)}</figcaption>
              </figure>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: 12 }}><button onClick={() => setComparing(false)} className="btn-press" style={ghost}>Close</button></div>
        </Modal>
      )}
    </div>
  );
}
