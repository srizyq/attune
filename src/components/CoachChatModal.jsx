import { useState, useEffect, useRef } from 'react';
import { useGeneralThread } from '../hooks/useCoach';
import { useClosingTransition } from '../hooks/useClosingTransition';

// Opened by clicking the Dashboard's general CoachNote tab — a real
// back-and-forth thread with the client's trainer, not just a one-way note.
export default function CoachChatModal({ trainerId, trainerName, trainerLogoUrl, onClose }) {
  const { messages, loading, sendReply } = useGeneralThread(trainerId);
  const { closing, close } = useClosingTransition(onClose);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setBody('');
    try {
      await sendReply(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div
        onClick={e => e.stopPropagation()}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 420, height: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {trainerLogoUrl && <img src={trainerLogoUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />}
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Coach {trainerName || ''}</span>
          </div>
          <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Loading…</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No messages yet.</p>
          ) : (
            messages.map(m => {
              const fromClient = m.sender_role === 'client';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: fromClient ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '9px 13px',
                    background: fromClient ? 'var(--bg-card)' : 'var(--accent-bg)',
                    border: `1px solid ${fromClient ? 'var(--border-default)' : 'var(--border-active)'}`,
                    borderRadius: fromClient ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{m.body}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-hint)', textAlign: fromClient ? 'right' : 'left' }}>
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Write a reply…"
            autoFocus
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="btn-press"
            style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
