import { useState } from 'react';
import { Card, SectionLabel } from './shared';
import { useTeam } from '../../hooks/useTeam';
import { useClientCoaches } from '../../hooks/useTeam';
import { useAuth } from '../../hooks/useAuth';
import { shareableTeammates } from '../../lib/coachTeam';

const STATUS_LABEL = { active: 'coaching', pending: 'waiting for the client to accept' };

// On a client's Overview: which teammates also coach them, and a way to bring
// another in. Asking a teammate creates an ordinary invitation the client must
// accept — until then the teammate can see nothing about them. Hidden entirely
// when you're not on a team (or before the database update).
export default function CoCoachCard({ clientId, clientName }) {
  const { user } = useAuth();
  const { supported: teamSupported, team, loading: teamLoading } = useTeam();
  const { supported, coaches, loading, share } = useClientCoaches(clientId);
  const [teammateId, setTeammateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);

  if (teamLoading || loading || !teamSupported || !supported || !team) return null;
  const options = shareableTeammates(team, user?.id, coaches);
  if (coaches.length === 0 && options.length === 0) return null;
  const who = clientName || 'the client';

  const send = async () => {
    const mate = options.find((m) => m.user_id === teammateId);
    if (!mate) return;
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      await share(mate.user_id);
      setSentTo(mate.name);
      setTeammateId('');
    } catch (err) {
      setError(err.message || "Couldn't send that — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionLabel icon="ti-users">Coaching team</SectionLabel>
      {coaches.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0 }}>
          {coaches.map((c) => (
            <li key={c.id} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong> is {STATUS_LABEL[c.status] || c.status}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>You're the only coach {who} has.</p>
      )}

      {options.length > 0 && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
            Bring a teammate in on {who}. They'll get an invitation to accept — a teammate can't see anything about {who} until they do.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="Teammate" value={teammateId} onChange={(e) => { setTeammateId(e.target.value); setSentTo(null); setError(null); }} style={{ flex: '1 1 180px', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">Choose a teammate…</option>
              {options.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
            <button onClick={send} disabled={!teammateId || busy} className="btn-press" style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: teammateId ? 'pointer' : 'default', opacity: teammateId ? 1 : 0.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {busy ? 'Sending…' : `Ask ${who === 'the client' ? 'them' : who} to accept`}
            </button>
          </div>
        </>
      )}
      {sentTo && <p role="status" style={{ color: 'var(--accent)', fontSize: 12, margin: '10px 0 0' }}>Sent — {who} will be asked whether {sentTo} can coach them too.</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
    </Card>
  );
}
