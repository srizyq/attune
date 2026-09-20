import { useState } from 'react';
import { useTrainerNotes } from '../../hooks/useCoach';
import { Card, SectionLabel } from './shared';

const iconBtn = { background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 14, padding: 4, lineHeight: 1 };

// The coach's own notes about a client. The database has no policy that lets
// the client (or anyone else) read them, so this is safe for the sort of thing
// you wouldn't say to their face — an injury, a comment on adherence.
export default function PrivateNotesCard({ client, clientData }) {
  const { notes, supported, loading, add, update, remove } = useTrainerNotes(client.id);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');

  const run = async (fn) => {
    setError(null);
    try { await fn(); } catch (err) { setError(err.message || 'Something went wrong — try again.'); }
  };

  const handleAdd = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    await run(async () => { await add(text); setBody(''); });
    setSaving(false);
  };

  const saveEdit = () => run(async () => {
    const text = editBody.trim();
    if (text) await update(editingId, { body: text });
    setEditingId(null);
  });

  return (
    <Card style={{ marginBottom: 0 }}>
      <SectionLabel icon="ti-lock">Private notes</SectionLabel>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, margin: '-6px 0 14px', lineHeight: 1.5 }}>
        Only you can see these — {clientData.name || 'your client'} can't.
      </p>

      {!supported && !loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Private notes need the latest database update, which hasn't been applied yet.</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="e.g. Mentioned a knee injury — avoid lunges"
              aria-label="New private note"
              maxLength={4000}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }}
            />
            <button
              onClick={handleAdd}
              disabled={!body.trim() || saving}
              className="btn-press"
              style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: !body.trim() || saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          ) : notes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No private notes yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
              {notes.map(n => (
                <div key={n.id} style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: `1px solid ${n.pinned ? 'var(--border-active)' : 'var(--border-default)'}`, borderRadius: 12 }}>
                  {editingId === n.id ? (
                    <>
                      <textarea
                        value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        aria-label="Edit note"
                        maxLength={4000}
                        rows={3}
                        autoFocus
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} className="btn-press" style={{ padding: '6px 12px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 7, color: '#0f0f0f', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Save</button>
                        <button onClick={() => setEditingId(null)} className="btn-press" style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {new Date(n.created_at).toLocaleString()}
                          {n.updated_at && new Date(n.updated_at) - new Date(n.created_at) > 1000 ? ' · edited' : ''}
                        </span>
                        <span style={{ display: 'flex', gap: 2 }}>
                          <button onClick={() => run(() => update(n.id, { pinned: !n.pinned }))} className="btn-press" style={{ ...iconBtn, color: n.pinned ? 'var(--accent)' : 'var(--text-hint)' }} title={n.pinned ? 'Unpin' : 'Pin to top'} aria-label={n.pinned ? 'Unpin note' : 'Pin note'}>
                            <i className="ti ti-pin" />
                          </button>
                          <button onClick={() => { setEditingId(n.id); setEditBody(n.body); }} className="btn-press" style={iconBtn} title="Edit" aria-label="Edit note">
                            <i className="ti ti-pencil" />
                          </button>
                          <button onClick={() => { if (window.confirm('Delete this note? This can’t be undone.')) run(() => remove(n.id)); }} className="btn-press" style={iconBtn} title="Delete" aria-label="Delete note">
                            <i className="ti ti-trash" />
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
