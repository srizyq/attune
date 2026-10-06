import { useState } from 'react';
import DragSheet from '../DragSheet';
import Avatar from './Avatar';
import CameraCapture from '../CameraCapture';
import ModalPortal from '../ModalPortal';
import ActionSheet from './ActionSheet';
import { useAuth } from '../../hooks/useAuth';
import { askForCommunityPush } from '../../lib/communityPush';
import { removePhoto, resizeToJpeg, screenPhoto, uploadPhoto } from '../../lib/communityPhotos';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { friendlyCommunityError } from '../../lib/community';
import { normalizeUsername, validateProfileText } from '../../lib/communityText';

const field = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '16px 0 6px' };
const err = { color: 'var(--danger)', fontSize: 12, marginTop: 6 };

function Switch({ id, checked, onChange, title, children }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border-default)', cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15 }}>{title}</span>
        {children && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>{children}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 26, height: 26, minWidth: 26, minHeight: 26, flexShrink: 0, accentColor: 'var(--accent)' }} />
    </label>
  );
}

/** Your Community profile and privacy settings in one sheet. */
export default function EditProfileSheet({ me, onSave, onLeave, onClose, onToast }) {
  const { closing, close } = useClosingTransition(onClose);
  const [username, setUsername] = useState(me.username);
  const [displayName, setDisplayName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio || '');
  const [isPrivate, setIsPrivate] = useState(!!me.is_private);
  const [discoverable, setDiscoverable] = useState(!!me.discoverable);
  const [notifyFollows, setNotifyFollows] = useState(me.notify_follows !== false);
  const [notifyReactions, setNotifyReactions] = useState(me.notify_reactions !== false);
  const [problems, setProblems] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const { user } = useAuth();
  const [avatar, setAvatar] = useState({ path: me.avatar_path || null, status: me.avatar_status || (me.avatar_path ? 'approved' : 'none') });
  const [capturing, setCapturing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Turning a notification on also asks this phone for permission and registers it.
  async function pushSwitch(set, on) {
    set(on);
    if (!on) return;
    const result = await askForCommunityPush(user.id);
    if (result === 'denied') onToast?.('Notifications are blocked for Attune. Turn them on in your phone\'s settings.');
  }

  // A new profile picture applies straight away (it isn't part of Save) and waits for the check.
  async function changeAvatar(file) {
    setCapturing(false);
    setPhotoBusy(true);
    setFormError(null);
    try {
      const blob = await resizeToJpeg(file, { maxEdge: 512 });
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      await uploadPhoto(path, blob);
      const old = avatar.path;
      try {
        await onSave({ avatar_path: path });
      } catch (err) {
        await removePhoto(path);
        throw err;
      }
      if (old) await removePhoto(old);
      setAvatar({ path, status: 'pending' });
      const status = await screenPhoto({ kind: 'avatar' });
      setAvatar({ path, status });
      onToast?.(status === 'approved' ? 'Profile photo updated' : status === 'rejected' ? 'That photo wasn\'t approved. Please choose a different one.' : 'Your photo is being checked');
    } catch (e) {
      setFormError(e.message && !/network|fetch/i.test(e.message) ? e.message : friendlyCommunityError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeAvatar() {
    setPhotoBusy(true);
    try {
      const old = avatar.path;
      await onSave({ avatar_path: null });
      await removePhoto(old);
      setAvatar({ path: null, status: 'none' });
    } catch (e) {
      setFormError(friendlyCommunityError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setFormError(null);
    const found = await validateProfileText({ username, displayName, bio });
    setProblems(found);
    if (Object.keys(found).length) return;
    const fields = { display_name: displayName.trim(), bio: bio.trim(), is_private: isPrivate, discoverable, notify_follows: notifyFollows, notify_reactions: notifyReactions };
    if (normalizeUsername(username) !== me.username) fields.username = normalizeUsername(username);
    setBusy(true);
    try {
      await onSave(fields);
      onToast?.('Profile saved');
      close();
    } catch (e) {
      const msg = friendlyCommunityError(e);
      if (/username/i.test(msg)) setProblems({ username: msg }); else setFormError(msg);
    } finally {
      setBusy(false);
    }
  }

  const goingPrivate = isPrivate && !me.is_private;
  return (
    <>
    <DragSheet
      title="Edit profile"
      onClose={close}
      closing={closing}
      footer={(
        <>
          {formError && <div role="alert" style={{ ...err, marginBottom: 8, marginTop: 0, fontSize: 13 }}>{formError}</div>}
          <button type="button" onClick={save} disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <Avatar name={displayName || me.display_name} path={avatar.status === 'rejected' ? null : avatar.path} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={photoBusy} onClick={() => setCapturing(true)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 14, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, padding: '9px 14px', cursor: 'pointer', minHeight: 40 }}>{avatar.path ? 'Change photo' : 'Add a photo'}</button>
            {avatar.path && <button type="button" disabled={photoBusy} onClick={removeAvatar} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 14, padding: '9px 8px', cursor: 'pointer', minHeight: 40 }}>Remove</button>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6 }}>
            {photoBusy ? 'Working…' : avatar.status === 'pending' ? 'Checking your photo…' : avatar.status === 'rejected' ? 'That photo wasn\'t approved.' : 'Others see your initials until a photo is approved.'}
          </div>
        </div>
      </div>

      <label htmlFor="ep-username" style={label}>Username</label>
      <input id="ep-username" style={field} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} />
      <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6 }}>You can change it once every 30 days.</div>
      {problems.username && <div role="alert" style={err}>{problems.username}</div>}

      <label htmlFor="ep-name" style={label}>Name people see</label>
      <input id="ep-name" style={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
      {problems.displayName && <div role="alert" style={err}>{problems.displayName}</div>}

      <label htmlFor="ep-bio" style={label}>Bio</label>
      <textarea id="ep-bio" style={{ ...field, minHeight: 64, resize: 'vertical' }} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} />
      {problems.bio && <div role="alert" style={err}>{problems.bio}</div>}

      <div style={{ marginTop: 18 }}>
        <Switch id="ep-private" checked={isPrivate} onChange={setIsPrivate} title="Private account">People ask to follow you and you approve them. Only followers see your posts.</Switch>
        {goingPrivate && <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0', lineHeight: 1.5 }}>Your public posts will become followers-only.</div>}
        <Switch id="ep-discoverable" checked={discoverable} onChange={setDiscoverable} title="Show me in Explore">Public accounts can appear when people browse for someone to follow. Has no effect on a private account.</Switch>
      </div>
      <div style={{ ...label, marginTop: 22 }}>Notifications</div>
      <div>
        <Switch id="ep-notify-follows" checked={notifyFollows} onChange={(on) => pushSwitch(setNotifyFollows, on)} title="New followers and requests" />
        <Switch id="ep-notify-reactions" checked={notifyReactions} onChange={(on) => pushSwitch(setNotifyReactions, on)} title="Hearts and flames" />
      </div>
      {onLeave && (
        <button type="button" onClick={() => setConfirmLeave(true)} style={{ display: 'block', margin: '28px auto 0', background: 'none', border: 'none', color: 'var(--danger)', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', minHeight: 44 }}>Leave Community</button>
      )}
    </DragSheet>
    {confirmLeave && (
      <ActionSheet
        title="Leave Community? This deletes your posts, photos, followers, saves and everything else you have here. You can join again later."
        actions={[{ label: 'Leave and delete everything', icon: 'ti-trash', danger: true, onSelect: async () => { try { await onLeave(); } catch (e) { setFormError(friendlyCommunityError(e)); } } }]}
        onClose={() => setConfirmLeave(false)}
      />
    )}
    {capturing && <ModalPortal><CameraCapture onCapture={changeAvatar} hint="Frame your face or your favourite food" fullScreen onClose={() => setCapturing(false)} /></ModalPortal>}
    </>
  );
}
