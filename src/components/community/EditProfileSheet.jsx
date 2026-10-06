import { useState } from 'react';
import DragSheet from '../DragSheet';
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
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>{children}</span>
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 26, height: 26, minWidth: 26, minHeight: 26, flexShrink: 0, accentColor: 'var(--accent)' }} />
    </label>
  );
}

/** Your Community profile and privacy settings in one sheet. */
export default function EditProfileSheet({ me, onSave, onClose, onToast }) {
  const { closing, close } = useClosingTransition(onClose);
  const [username, setUsername] = useState(me.username);
  const [displayName, setDisplayName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio || '');
  const [isPrivate, setIsPrivate] = useState(!!me.is_private);
  const [discoverable, setDiscoverable] = useState(!!me.discoverable);
  const [problems, setProblems] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  async function save() {
    setFormError(null);
    const found = await validateProfileText({ username, displayName, bio });
    setProblems(found);
    if (Object.keys(found).length) return;
    const fields = { display_name: displayName.trim(), bio: bio.trim(), is_private: isPrivate, discoverable };
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
      <label htmlFor="ep-username" style={{ ...label, marginTop: 0 }}>Username</label>
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
    </DragSheet>
  );
}
