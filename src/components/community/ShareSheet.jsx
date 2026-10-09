import { useEffect, useRef, useState } from 'react';
import DragSheet from '../DragSheet';
import PostCard from './PostCard';
import CameraCapture from '../CameraCapture';
import ModalPortal from '../ModalPortal';
import { useAuth } from '../../hooks/useAuth';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { createPost, friendlyCommunityError } from '../../lib/community';
import { newPhotoId, removePhoto, resizeToJpeg, screenPhoto, uploadPhoto } from '../../lib/communityPhotos';
import { NOTE_MAX, validateNote } from '../../lib/communityText';
import { needsLowCalorieCheck, LOW_CALORIE_DAY } from '../../lib/communityPosts';

const seg = (on) => ({ flex: 1, padding: '11px 10px', borderRadius: 14, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--accent-bg)' : 'var(--bg-card)', color: on ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${on ? 'var(--border-active)' : 'var(--border-default)'}` });
const label = { fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '18px 0 8px', display: 'block' };

// A very low day isn't blocked, but it isn't posted without a pause either.
function LowCalorieCheck({ onContinue, onCancel }) {
  return (
    <div role="group" aria-label="Before you share this day" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: 20 }}>
      <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 18, margin: 0 }}>This looks like a low day</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
        It's under {LOW_CALORIE_DAY.toLocaleString()} kcal. If food has felt hard lately, you don't have to share it. Talking to someone can help — in Australia, the Butterfly Foundation helpline is{' '}
        <a href="tel:1800334673" style={{ color: 'var(--accent)' }}>1800 33 4673</a> (<a href="https://butterfly.org.au" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>butterfly.org.au</a>). Elsewhere, search for eating-disorder support in your country.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 13, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Not now</button>
        <button type="button" onClick={onContinue} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 13, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Share anyway</button>
      </div>
    </div>
  );
}

/**
 * "Share to Community": preview, who can see it, an optional note, Post.
 * `draft` is what the builders in lib/communityPosts.js return ({ kind, payload }).
 * A private account can only post to followers.
 */
export default function ShareSheet({ draft, me, initialNote = '', onClose, onPosted }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [checked, setChecked] = useState(!needsLowCalorieCheck(draft.kind, draft.payload));
  const [audience, setAudience] = useState(me.is_private ? 'followers' : 'public');
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [capturing, setCapturing] = useState(false);
  const urlRef = useRef(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function takePhoto(file) {
    setCapturing(false);
    setError(null);
    try {
      const blob = await resizeToJpeg(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPhoto({ blob, url: urlRef.current });
    } catch (err) {
      setError(err.message || 'Could not use that photo.');
    }
  }

  async function post() {
    if (busy) return;
    setError(null);
    const problem = await validateNote(note);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const fields = { kind: draft.kind, payload: draft.payload, audience: me.is_private ? 'followers' : audience, note };
      if (!photo) {
        await createPost(user.id, fields);
        onPosted?.('Shared to Community');
      } else {
        // The file is named after the post so the two can't drift apart.
        const id = newPhotoId();
        const path = `${user.id}/${id}.jpg`;
        await uploadPhoto(path, photo.blob);
        try {
          await createPost(user.id, { ...fields, id, photoPath: path });
        } catch (err) {
          await removePhoto(path);
          throw err;
        }
        const status = await screenPhoto({ kind: 'post', postId: id });
        onPosted?.(status === 'approved' ? 'Shared to Community'
          : status === 'rejected' ? 'Shared, but the photo wasn\'t approved. Only safe food photos can be posted.'
          : 'Shared. Your photo is being checked.');
      }
      close();
    } catch (err) {
      console.error('Share failed:', err);
      setError(friendlyCommunityError(err));
    } finally {
      setBusy(false);
    }
  }

  const preview = {
    id: 'preview', author_id: user.id, username: me.username, display_name: me.display_name, is_coach: false,
    kind: draft.kind, audience, payload: draft.payload, note: note.trim(), photo_path: null, hidden: false,
    created_at: new Date().toISOString(), edited_at: null, hearts: 0, flames: 0, copies: 0, my_heart: false, my_flame: false, saved: false,
  };

  return (
    <>
    <DragSheet
      title="Share to Community"
      onClose={close}
      closing={closing}
      footer={checked ? (
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={post} disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Posting…' : 'Post'}</button>
        </>
      ) : null}
    >
      {!checked ? (
        <LowCalorieCheck onContinue={() => setChecked(true)} onCancel={close} />
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>This is how it will look</div>
          <PostCard post={preview} mine photoUrl={photo?.url || null} />

          <span style={label} id="share-audience">Who can see this</span>
          {me.is_private ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>Your account is private, so only people who follow you can see it.</p>
          ) : (
            <div role="group" aria-labelledby="share-audience" style={{ display: 'flex', gap: 8 }}>
              <button type="button" aria-pressed={audience === 'public'} onClick={() => setAudience('public')} style={seg(audience === 'public')}>Public</button>
              <button type="button" aria-pressed={audience === 'followers'} onClick={() => setAudience('followers')} style={seg(audience === 'followers')}>Followers</button>
            </div>
          )}

          <span style={label}>Photo (optional)</span>
          {photo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={photo.url} alt="Your photo" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />
              <button type="button" onClick={() => setPhoto(null)} style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 14, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, padding: '10px 16px', cursor: 'pointer', minHeight: 40 }}>Remove photo</button>
            </div>
          ) : (
            <button type="button" onClick={() => setCapturing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px dashed var(--border-strong)', borderRadius: 14, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, padding: '11px 16px', cursor: 'pointer', minHeight: 44 }}>
              <i className="ti ti-camera" aria-hidden="true" />Add a photo
            </button>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.5, margin: '8px 0 0' }}>Photos are checked before others see them. Only safe photos of food are allowed.</p>

          <label htmlFor="share-note" style={label}>Add a note (optional)</label>
          <textarea
            id="share-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Tasty, and easy to make."
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-hint)', textAlign: 'right', marginTop: 4 }}>{note.length}/{NOTE_MAX}</div>
          <p style={{ fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.5, margin: '8px 0 0' }}>Shows calories and macros. Your weight is never shown. You can edit the note or delete the post any time.</p>
        </>
      )}
    </DragSheet>
    {/* After the sheet so it opens above it (both are portalled). */}
    {capturing && <ModalPortal><CameraCapture onCapture={takePhoto} hint="Frame your meal" fullScreen onClose={() => setCapturing(false)} /></ModalPortal>}
    </>
  );
}