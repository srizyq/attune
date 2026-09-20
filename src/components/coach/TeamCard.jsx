import { useState } from 'react';
import { Card, SectionLabel } from './shared';
import { fieldStyle, labelStyle } from './constants';
import { useTeam } from '../../hooks/useTeam';
import { useAuth } from '../../hooks/useAuth';
import { clientCountLabel, inviteExpiry, validateTeamName } from '../../lib/coachTeam';
import { normalizeInviteCode } from '../../lib/coachInvite';

const primary = { padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };
const ghost = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };
const quiet = { ...ghost, border: 'none', color: 'var(--text-muted)', padding: '6px 8px' };

function initials(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// A practitioner's team: who's on it and how many clients each coaches (a
// count — never names), plus invite codes for the owner. Teammates never see
// each other's clients; bringing a teammate in on a client is a separate step
// the client has to agree to (see CoCoachCard).
export default function TeamCard() {
  const { user } = useAuth();
  const team = useTeam();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  if (team.loading || !team.supported) return null;

  const act = async (key, fn) => {
    setBusy(key);
    setError(null);
    try { await fn(); return true; } catch (err) { setError(err.message || 'Something went wrong — try again.'); return false; } finally { setBusy(null); }
  };

  const handleCreate = () => {
    const { name: clean, error: problem } = validateTeamName(name);
    if (problem) { setError(problem); return; }
    act('create', async () => { await team.create(clean); setName(''); });
  };
  const handleJoin = () => {
    const clean = normalizeInviteCode(code);
    if (!clean) { setError('Enter the invite code you were given.'); return; }
    act('join', async () => { await team.join(clean); setCode(''); });
  };
  const copy = async (invite) => {
    try { await navigator.clipboard.writeText(invite.code); setCopiedId(invite.id); setTimeout(() => setCopiedId((id) => (id === invite.id ? null : id)), 1500); } catch { /* clipboard blocked — the code is on screen */ }
  };
  const confirmThen = (message, fn) => () => { if (window.confirm(message)) fn(); };

  const t = team.team;

  if (!t) {
    return (
      <Card>
        <SectionLabel icon="ti-users-group">Team</SectionLabel>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          Coach alongside colleagues? A team shows who's on it and lets you bring a teammate in on a client — your clients are never shared unless they agree to it. Everyone keeps their own Coach Pass.
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="team-name" style={labelStyle}>Start a team</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="team-name" value={name} maxLength={60} placeholder="e.g. Northside Physio" onChange={(e) => { setName(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} style={fieldStyle} />
              <button onClick={handleCreate} disabled={busy === 'create'} className="btn-press" style={{ ...primary, flexShrink: 0 }}>{busy === 'create' ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="team-code" style={labelStyle}>Or join one</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="team-code" value={code} placeholder="Invite code" onChange={(e) => { setCode(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }} style={{ ...fieldStyle, textTransform: 'uppercase' }} />
              <button onClick={handleJoin} disabled={busy === 'join'} className="btn-press" style={{ ...ghost, flexShrink: 0 }}>{busy === 'join' ? 'Joining…' : 'Join'}</button>
            </div>
          </div>
        </div>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel icon="ti-users-group">Team</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.members.length} of {t.max_members} members</span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>
        Teammates see each other's names and client counts, not clients. A client is only shared with a teammate if the client accepts.
      </p>

      <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
        {t.members.map((m) => (
          <li key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'var(--accent)', fontFamily: "'Syne', sans-serif", flexShrink: 0 }}>{initials(m.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {m.name}{m.user_id === user?.id ? ' (you)' : ''}
                {m.role === 'owner' && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>OWNER</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {clientCountLabel(m.client_count)}{!m.has_pass ? ' · Coach Pass inactive' : ''}
              </div>
            </div>
            {t.is_owner && m.user_id !== user?.id && (
              <button aria-label={`Remove ${m.name}`} onClick={confirmThen(`Remove ${m.name} from ${t.name}? Their clients aren't affected.`, () => act(`remove-${m.user_id}`, () => team.remove(m.user_id)))} disabled={busy === `remove-${m.user_id}`} className="btn-press" style={quiet}>Remove</button>
            )}
          </li>
        ))}
      </ul>

      {t.is_owner && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => act('invite', () => team.invite())} disabled={busy === 'invite'} className="btn-press" style={ghost}>{busy === 'invite' ? 'Creating…' : '+ Invite a teammate'}</button>
          {t.invites.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {t.invites.map((i) => (
                <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0' }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)' }}>{i.code}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{inviteExpiry(i.expires_at)} · single use</span>
                  <button onClick={() => copy(i)} className="btn-press" style={ghost}>{copiedId === i.id ? 'Copied' : 'Copy code'}</button>
                  <button aria-label={`Revoke invite ${i.code}`} onClick={() => act(`revoke-${i.id}`, () => team.revokeInvite(i.id))} className="btn-press" style={quiet}>Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}

      {t.is_owner ? (
        <button onClick={confirmThen(`Remove the team "${t.name}"? Members are taken off it. Coaching links between coaches and clients aren't affected.`, () => act('disband', () => team.disband()))} disabled={busy === 'disband'} className="btn-press" style={quiet}>Remove team</button>
      ) : (
        <button onClick={confirmThen(`Leave ${t.name}? Your own clients aren't affected.`, () => act('leave', () => team.leave()))} disabled={busy === 'leave'} className="btn-press" style={quiet}>Leave team</button>
      )}
    </Card>
  );
}
