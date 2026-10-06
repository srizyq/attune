import { useState } from 'react';
import DragSheet from '../DragSheet';
import { useAuth } from '../../hooks/useAuth';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { REPORT_REASONS, reportPost, friendlyCommunityError } from '../../lib/community';

/** Report a post (postId + userId) or just a person (userId). */
export default function ReportSheet({ postId = null, userId, username, onClose, onDone }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send() {
    if (!reason) { setError('Choose a reason.'); return; }
    setBusy(true);
    setError(null);
    try {
      await reportPost(user.id, { postId, userId, reason, details });
      onDone?.('Thanks — we\'ll take a look');
      close();
    } catch (err) {
      const duplicate = /duplicate key/i.test(err?.message || '');
      if (duplicate) { onDone?.('You\'ve already reported this'); close(); return; }
      console.error('Report failed:', err);
      setError(friendlyCommunityError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DragSheet
      title={postId ? 'Report post' : `Report @${username}`}
      onClose={close}
      closing={closing}
      footer={(
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={send} disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send report'}</button>
        </>
      )}
    >
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>Reports are private. The person isn't told who reported them.</p>
      <div role="radiogroup" aria-label="Reason">
        {REPORT_REASONS.map((r) => (
          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '4px 4px', borderBottom: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 15 }}>
            <input type="radio" name="reason" checked={reason === r.id} onChange={() => { setReason(r.id); setError(null); }} style={{ width: 26, height: 26, minWidth: 26, minHeight: 26, flexShrink: 0, accentColor: 'var(--accent)' }} />
            {r.label}
          </label>
        ))}
      </div>
      <label htmlFor="report-details" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '16px 0 8px' }}>More detail (optional)</label>
      <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
    </DragSheet>
  );
}
