import { useState } from 'react';
import DragSheet from '../DragSheet';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { NOTE_MAX, validateNote } from '../../lib/communityText';
import { friendlyCommunityError } from '../../lib/community';

/** Change a post's note (the numbers stay as posted) and, for a public account, who can see it. */
export default function EditNoteSheet({ post, isPrivate, onSave, onClose }) {
  const { closing, close } = useClosingTransition(onClose);
  const [note, setNote] = useState(post.note || '');
  const [audience, setAudience] = useState(post.audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    const problem = await validateNote(note);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ note: note.trim(), audience: isPrivate ? 'followers' : audience });
      close();
    } catch (err) {
      setError(friendlyCommunityError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DragSheet
      title="Edit post"
      onClose={close}
      closing={closing}
      footer={(
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={save} disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>The numbers stay as you posted them. You can change the note{isPrivate ? '' : ' and who can see it'}.</p>
      <label htmlFor="en-note" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Note</label>
      <textarea id="en-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
      <div style={{ fontSize: 12, color: 'var(--text-hint)', textAlign: 'right', marginTop: 4 }}>{note.length}/{NOTE_MAX}</div>
      {!isPrivate && (
        <div role="group" aria-label="Who can see this" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {['public', 'followers'].map((a) => (
            <button key={a} type="button" aria-pressed={audience === a} onClick={() => setAudience(a)} style={{ flex: 1, padding: '11px 10px', borderRadius: 14, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', background: audience === a ? 'var(--accent-bg)' : 'var(--bg-card)', color: audience === a ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${audience === a ? 'var(--border-active)' : 'var(--border-default)'}` }}>{a === 'public' ? 'Public' : 'Followers'}</button>
          ))}
        </div>
      )}
    </DragSheet>
  );
}
