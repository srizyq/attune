import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ageGate, checkUsername, normalizeUsername, validateProfileText } from '../../lib/communityText';
import { friendlyCommunityError } from '../../lib/community';

const field = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '16px 0 6px' };
const errorText = { color: 'var(--danger)', fontSize: 12, marginTop: 6 };

function Choice({ checked, onChange, icon, title, children }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, cursor: 'pointer', background: checked ? 'var(--accent-bg)' : 'var(--bg-primary)', border: `1px solid ${checked ? 'var(--border-active)' : 'var(--border-default)'}`, marginBottom: 8 }}>
      <input type="radio" name="audience" checked={checked} onChange={onChange} style={{ marginTop: 0, width: 26, height: 26, minWidth: 26, minHeight: 26, flexShrink: 0, accentColor: 'var(--accent)' }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: checked ? 'var(--accent)' : 'var(--text-primary)' }}><i className={`ti ${icon}`} aria-hidden="true" />{title}</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>{children}</span>
      </span>
    </label>
  );
}

/**
 * First time in Community: pick a @username, a name, and whether the account
 * is public or private. Needs a known age of 16 or over.
 */
export default function JoinCommunity({ profile, onJoin }) {
  const navigate = useNavigate();
  const gate = ageGate(profile);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState((profile?.name || '').slice(0, 40));
  const [bio, setBio] = useState('');
  const [isPrivate, setIsPrivate] = useState(null);
  const [problems, setProblems] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  if (gate === 'too_young') {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>Community is for people aged 16 and over.</p>;
  }
  if (gate === 'unknown') {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: 20 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>One thing first</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>Community is for people aged 16 and over. Add your age in your profile so we can check.</p>
        <button type="button" onClick={() => navigate('/profile')} style={{ background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Open profile</button>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setFormError(null);
    const found = await validateProfileText({ username, displayName, bio });
    if (isPrivate === null) found.audience = 'Choose public or private. You can change it later.';
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onJoin({ username: normalizeUsername(username), displayName, bio, isPrivate });
    } catch (err) {
      const msg = friendlyCommunityError(err);
      if (/username/i.test(msg)) setProblems({ username: msg }); else setFormError(msg);
    } finally {
      setBusy(false);
    }
  }

  const usernameHint = username && !problems.username ? checkUsername(username) : null;

  return (
    <form onSubmit={submit} noValidate style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '20px 18px' }}>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, margin: 0 }}>Join Community</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '6px 0 0' }}>Share meals, days and recipes with friends, and copy theirs into your log. You choose everything you post.</p>

      <label htmlFor="cm-username" style={label}>Username</label>
      <input id="cm-username" style={field} value={username} onChange={(e) => { setUsername(e.target.value); setProblems((p) => ({ ...p, username: undefined })); }} placeholder="maya.k" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} aria-describedby="cm-username-help" />
      <div id="cm-username-help" style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6 }}>3–20 letters, numbers, dots or underscores. You can change it once every 30 days.</div>
      {(problems.username || usernameHint) && <div role="alert" style={errorText}>{problems.username || usernameHint}</div>}

      <label htmlFor="cm-name" style={label}>Name people see</label>
      <input id="cm-name" style={field} value={displayName} onChange={(e) => { setDisplayName(e.target.value); setProblems((p) => ({ ...p, displayName: undefined })); }} maxLength={40} />
      {problems.displayName && <div role="alert" style={errorText}>{problems.displayName}</div>}

      <label htmlFor="cm-bio" style={label}>Bio (optional)</label>
      <textarea id="cm-bio" style={{ ...field, minHeight: 64, resize: 'vertical' }} value={bio} onChange={(e) => { setBio(e.target.value); setProblems((p) => ({ ...p, bio: undefined })); }} maxLength={160} placeholder="Meal prep Sundays." />
      {problems.bio && <div role="alert" style={errorText}>{problems.bio}</div>}

      <div style={label} id="cm-audience">Who can follow you</div>
      <div role="radiogroup" aria-labelledby="cm-audience">
        <Choice checked={isPrivate === false} onChange={() => { setIsPrivate(false); setProblems((p) => ({ ...p, audience: undefined })); }} icon="ti-world" title="Public">Anyone can follow you and see the posts you share publicly. You appear in Explore.</Choice>
        <Choice checked={isPrivate === true} onChange={() => { setIsPrivate(true); setProblems((p) => ({ ...p, audience: undefined })); }} icon="ti-lock" title="Private">People ask to follow you and you approve them. Only followers see your posts.</Choice>
      </div>
      {problems.audience && <div role="alert" style={errorText}>{problems.audience}</div>}

      <p style={{ color: 'var(--text-hint)', fontSize: 12, lineHeight: 1.5, margin: '12px 0 14px' }}>Posts show calories and macros. Your weight is never shown. Be kind: abuse can be reported and removed.</p>
      {formError && <div role="alert" style={{ ...errorText, marginBottom: 10 }}>{formError}</div>}
      <button type="submit" disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Joining…' : 'Join Community'}
      </button>
    </form>
  );
}
