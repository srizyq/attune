import { useEffect, useState } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useCoachInvites } from '../hooks/useCoach';
import { inviteLink, inviteState, daysLeft } from '../lib/coachInvite';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // legacy fallback only

function legacyCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  return code;
}

const btn = (primary) => ({
  padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: primary ? 'var(--accent)' : 'transparent',
  border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-default)'}`,
  color: primary ? '#0f0f0f' : 'var(--accent)',
});

function SectionLabel({ icon, children }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
      {children}
    </p>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // permission denied / insecure context — the text is still on screen to copy by hand
  }
}

// The trainer's "invite a client" card. Each invite is single-use and
// expires, so a link that leaks (or a client who never joins) can't be used
// later — unlike the single permanent code every client used to share. The
// client sees a consent screen before anything is shared; until they accept,
// the invite shows up here as "waiting".
export default function CoachInvitePanel({ hasClients }) {
  const { profile, save: saveProfile } = useProfile();
  const { invites, pending, supported, loading, refetch, create, revoke } = useCoachInvites();
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [legacyBusy, setLegacyBusy] = useState(false);

  // A client accepting happens on their device, not this one — refresh when
  // the trainer comes back to the tab so "waiting" doesn't go stale.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  const openInvites = invites.filter(i => inviteState(i) === 'open');

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await create(label.trim());
      setLabel('');
    } catch (err) {
      setError(err.message || "Couldn't create the invite — try again.");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (invite) => {
    const ok = await copyText(inviteLink(window.location.origin, invite.code));
    if (ok) {
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(id => (id === invite.id ? null : id)), 1500);
    }
  };

  const share = async (invite) => {
    const url = inviteLink(window.location.origin, invite.code);
    const text = `Join me on Attune — here's your invite${invite.label ? ` (${invite.label})` : ''}:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Attune coaching invite', text, url }); return; } catch { /* dismissed — fall through to copy */ }
    }
    copyLink(invite);
  };

  const handleRevoke = async (invite) => {
    setError(null);
    try { await revoke(invite.id); } catch (err) { setError(err.message || "Couldn't revoke that invite."); }
  };

  const turnOffLegacy = async () => {
    setLegacyBusy(true);
    setError(null);
    try { await saveProfile({ coach_invite_code: null }); } catch (err) { setError(err.message || "Couldn't turn that off."); } finally { setLegacyBusy(false); }
  };

  const generateLegacy = async () => {
    setLegacyBusy(true);
    setError(null);
    try {
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await saveProfile({ coach_invite_code: legacyCode() }); lastErr = null; break; } catch (err) { lastErr = err; }
      }
      if (lastErr) throw lastErr;
    } catch (err) {
      setError(err.message || "Couldn't generate a code — try again.");
    } finally {
      setLegacyBusy(false);
    }
  };

  const card = { background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 16, padding: 24 };

  // Migration not run yet: keep the old shared-code flow working rather than
  // showing a panel that can't create anything.
  if (!loading && !supported) {
    return (
      <div style={card}>
        <SectionLabel icon="ti-user-plus">{hasClients ? 'Invite another client' : 'Invite your first client'}</SectionLabel>
        {profile?.coach_invite_code && (
          <div style={{ padding: '14px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-active)', borderRadius: 10, fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)', textAlign: 'center', marginBottom: 14 }}>
            {profile.coach_invite_code}
          </div>
        )}
        {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
        <button onClick={generateLegacy} disabled={legacyBusy} className="btn-press" style={btn(false)}>
          {legacyBusy ? 'Generating…' : profile?.coach_invite_code ? 'Regenerate code' : 'Generate code'}
        </button>
      </div>
    );
  }

  return (
    <div style={card}>
      <SectionLabel icon="ti-user-plus">{hasClients ? 'Invite another client' : 'Invite your first client'}</SectionLabel>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
        Each invite works once and expires after 7 days. Your client sees exactly what you'll have access to and has to accept before anything is shared.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
          maxLength={60}
          placeholder="Who's it for? (optional)"
          aria-label="Invite label"
          style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button onClick={handleCreate} disabled={creating} className="btn-press" style={{ ...btn(true), flexShrink: 0 }}>
          {creating ? 'Creating…' : 'Create invite'}
        </button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}

      {openInvites.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {openInvites.map(invite => (
            <div key={invite.id} className="stagger-item" style={{ padding: '12px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.label || 'Unnamed invite'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {daysLeft(invite) <= 1 ? 'expires soon' : `${daysLeft(invite)} days left`}
                </span>
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: 10 }}>{invite.code}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => copyLink(invite)} className="btn-press" style={{ ...btn(false), padding: '6px 12px', fontSize: 12 }}>
                  {copiedId === invite.id ? 'Copied ✓' : 'Copy link'}
                </button>
                <button onClick={() => share(invite)} className="btn-press" style={{ ...btn(false), padding: '6px 12px', fontSize: 12 }}>Share</button>
                <button onClick={() => handleRevoke(invite)} className="btn-press" style={{ padding: '6px 12px', fontSize: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Revoke</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Waiting for acceptance</div>
          {pending.map(p => (
            <div key={p.link_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{p.client_name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(p.requested_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {profile?.coach_invite_code && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Your old shared code <strong style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>{profile.coach_invite_code}</strong> still works for anyone who has it.
          </span>
          <button onClick={turnOffLegacy} disabled={legacyBusy} className="btn-press" style={{ ...btn(false), padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {legacyBusy ? 'Turning off…' : 'Turn off'}
          </button>
        </div>
      )}
    </div>
  );
}
