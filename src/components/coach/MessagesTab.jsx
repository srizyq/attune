import { useMemo, useState } from 'react';
import { useTrainerComments } from '../../hooks/useCoach';
import { Card, SectionLabel } from './shared';
import { COMMENT_CATEGORIES } from './constants';
import PrivateNotesCard from './PrivateNotesCard';

const VIEWS = [
  { id: 'thread', label: 'Messages to client', icon: 'ti-message-circle' },
  { id: 'notes', label: 'Private notes', icon: 'ti-lock' },
];

// Two clearly separate places to write: what the client will see, and what
// only the coach will. Keeping them on separate sub-tabs (with the lock icon
// on the private one) is what stops a private note being posted as a message.
export default function MessagesTab({ client, clientData, d }) {
  const [view, setView] = useState('thread');
  const [commentBody, setCommentBody] = useState('');
  const [commentCategory, setCommentCategory] = useState('general');
  const { comments, addComment, removeComment } = useTrainerComments(client.id);
  const { date } = d;
  // The category picker doubles as a filter tab — only the selected
  // category's thread shows below, matching what its label already implies.
  const commentsInTab = useMemo(() => comments.filter(c => c.category === commentCategory), [comments, commentCategory]);

  const handleAddComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    setCommentBody('');
    await addComment(body, date, commentCategory);
  };

  return (
    <div>
      <div role="tablist" aria-label="Messages view" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className="btn-press"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: view === v.id ? 'var(--accent-bg)' : 'var(--bg-card)',
              border: `1px solid ${view === v.id ? 'var(--accent-dark)' : 'var(--border-strong)'}`,
              color: view === v.id ? 'var(--accent)' : 'var(--text-muted)', fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <i className={`ti ${v.icon}`} style={{ fontSize: 14 }} />
            {v.label}
          </button>
        ))}
      </div>

      {view === 'thread' ? (
          <Card style={{ marginBottom: 0 }}>
            <SectionLabel icon="ti-message-circle">Comments</SectionLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {COMMENT_CATEGORIES.map(cat => {
                const selected = commentCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCommentCategory(cat.id)}
                    className="btn-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20,
                      background: selected ? cat.color + '22' : 'var(--bg-primary)',
                      border: `1px solid ${selected ? cat.color : 'var(--border-default)'}`,
                      color: selected ? cat.color : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <i className={`ti ${cat.icon}`} style={{ fontSize: 12 }} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder={`Leave a note for ${clientData.name || 'this client'}…`}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={handleAddComment}
                disabled={!commentBody.trim()}
                className="btn-press"
                style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
              >
                Post
              </button>
            </div>
            {commentsInTab.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No {COMMENT_CATEGORIES.find(c => c.id === commentCategory)?.label.toLowerCase()} comments yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                {commentsInTab.map(c => {
                  const fromClient = c.sender_role === 'client';
                  const cat = COMMENT_CATEGORIES.find(x => x.id === c.category) || COMMENT_CATEGORIES[0];
                  return (
                    <div key={c.id} className="stagger-item" style={{ display: 'flex', justifyContent: fromClient ? 'flex-start' : 'flex-end', gap: 8 }}>
                      {!fromClient && (
                        <button
                          onClick={() => removeComment(c.id)}
                          className="btn-press"
                          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 13, flexShrink: 0, alignSelf: 'flex-end', padding: 4 }}
                          title="Delete"
                        >
                          <i className="ti ti-trash" />
                        </button>
                      )}
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px',
                        background: fromClient ? 'var(--bg-primary)' : 'var(--accent-bg)',
                        border: `1px solid ${fromClient ? 'var(--border-default)' : 'var(--border-active)'}`,
                        borderRadius: fromClient ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                      }}>
                        {!fromClient && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                            <i className={`ti ${cat.icon}`} style={{ fontSize: 11, color: cat.color }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.label}</span>
                          </div>
                        )}
                        <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{c.body}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '4px 0 0', textAlign: fromClient ? 'left' : 'right' }}>
                          {c.comment_date ? `On ${c.comment_date} · ` : ''}{new Date(c.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
      ) : (
        <PrivateNotesCard client={client} clientData={clientData} />
      )}
    </div>
  );
}
