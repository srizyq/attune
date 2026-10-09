import { useState } from 'react';
import { Card, SectionLabel } from './shared';
import { fieldStyle, labelStyle } from './constants';
import { useTeam } from '../../hooks/useTeam';
import { useAuth } from '../../hooks/useAuth';
import { clientCountLabel, inviteExpiry, validateTeamName } from '../../lib/coachTeam';
import { normalizeInviteCode } from '../../lib/coachInvite';
import FormRow from '../FormRow';
import ListRow from '../ListRow';

const ghost = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };
const quiet = { ...ghost, border: 'none', color: 'var(--text-muted)', padding: '6px 8px' };

// A teammate's info + (owner-only) remove action — previously an inline
// "Remove" text button on the row itself; now the row's own detail view,
// since the row became a single tap target like everywhere else.
function TeamMemberDetail({ member, isSelf, isOwnerView, teamName, onRemove, busy, onClose }) {
  return (
    <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={member.name} onClick={e => e.stopPropagation()} className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <ListRow.SquareAvatar name={member.name} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {member.name}{isSelf ? ' (you)' : ''}
            </div>
            {member.role === 'owner' && (
              <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>OWNER</span>
            )}
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {clientCountLabel(member.client_count)}{!member.has_pass ? ' · Coach Pass inactive' : ''}
        </p>
        {isOwnerView && !isSelf && (
          <FormRow.Button
            icon="ti-user-x"
            danger
            disabled={busy}
            onClick={() => { if (window.confirm(`Remove ${member.name} from ${teamName}? Their clients aren't affected.`)) onRemove(); }}
          >
            {busy ? 'Removing…' : `Remove from team`}
          </FormRow.Button>
        )}
      </div>
    </div>
  );
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
  const [selectedMember, setSelectedMember] = useState(null);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label htmlFor="team-name" style={labelStyle}>Start a team</label>
            <FormRow>
              <input id="team-name" value={name} maxLength={60} placeholder="e.g. Northside Physio" onChange={(e) => { setName(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} style={fieldStyle} />
              <FormRow.Button icon="ti-plus" primary onClick={handleCreate} disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create'}</FormRow.Button>
            </FormRow>
          </div>
          <div>
            <label htmlFor="team-code" style={labelStyle}>Or join one</label>
            <FormRow>
              <input id="team-code" value={code} placeholder="Invite code" onChange={(e) => { setCode(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }} style={{ ...fieldStyle, textTransform: 'uppercase' }} />
              <FormRow.Button icon="ti-login-2" onClick={handleJoin} disabled={busy === 'join'}>{busy === 'join' ? 'Joining…' : 'Join'}</FormRow.Button>
            </FormRow>
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
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.members.length} of {t.max_members} members</span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>
        Teammates see each other's names and client counts, not clients. A client is only shared with a teammate if the client accepts.
      </p>

      <div style={{ marginBottom: 16 }}>
        {t.members.map((m) => (
          <ListRow
            key={m.user_id}
            avatar={<ListRow.SquareAvatar name={m.name} />}
            title={(
              <>
                {m.name}{m.user_id === user?.id ? ' (you)' : ''}
                {m.role === 'owner' && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>OWNER</span>}
              </>
            )}
            subtitleParts={[clientCountLabel(m.client_count), !m.has_pass ? 'Coach Pass inactive' : null]}
            trailing={<ListRow.Chevron />}
            onClick={() => setSelectedMember(m)}
          />
        ))}
      </div>
      {selectedMember && (
        <TeamMemberDetail
          member={selectedMember}
          isSelf={selectedMember.user_id === user?.id}
          isOwnerView={t.is_owner}
          teamName={t.name}
          busy={busy === `remove-${selectedMember.user_id}`}
          onRemove={() => act(`remove-${selectedMember.user_id}`, () => team.remove(selectedMember.user_id)).then((ok) => { if (ok) setSelectedMember(null); })}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {t.is_owner && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => act('invite', () => team.invite())} disabled={busy === 'invite'} className="btn-press" style={ghost}>{busy === 'invite' ? 'Creating…' : '+ Invite a teammate'}</button>
          {t.invites.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {t.invites.map((i) => (
                <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0' }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)' }}>{i.code}</span>
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
