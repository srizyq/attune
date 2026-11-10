import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useCoachInbox } from '../hooks/useCoach';
import { messageKind, relativeLabel } from '../lib/coachInbox';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import CoachChatModal from '../components/CoachChatModal';
import StatBadge from '../components/StatBadge';

function initialsOf(name) {
  return (name || 'Coach').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function CoachAvatar({ trainer }) {
  if (trainer?.coach_logo_url) {
    return <img src={trainer.coach_logo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--chip-bg)', color: 'var(--accent-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
      {initialsOf(trainer?.name)}
    </span>
  );
}

// Everything the user's coach has sent. A general note opens the two-way
// chat; the others jump to the page they're about. Opening this page clears
// the dashboard bell's dot.
export default function Notifications() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { trainers, messages, loading, markSeen } = useCoachInbox();
  const [chatWith, setChatWith] = useState(null);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  useEffect(() => { markSeen(); }, [markSeen]);

  const trainerById = new Map(trainers.map((t) => [t.trainer.id, t.trainer]));

  const openMessage = (m) => {
    const { target } = messageKind(m);
    const trainer = trainerById.get(m.trainer_id);
    if (target === 'weight') navigate('/expenditure', { state: { scrollTo: 'weight' } });
    else if (target === 'food') navigate('/log', { state: { date: m.comment_date } });
    else setChatWith(trainer ? { id: m.trainer_id, ...trainer } : { id: m.trainer_id });
  };

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="dashboard" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Notifications" onBack={() => navigate('/dashboard')} backLabel="Back to Dashboard" />
        <div className="page-pad" style={{ maxWidth: 720 }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Loading…</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Nothing from your coach yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m) => {
                const trainer = trainerById.get(m.trainer_id);
                const kind = messageKind(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m)}
                    style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '14px 14px' }}
                  >
                    <CoachAvatar trainer={trainer} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Coach {trainer?.name || ''}</span>
                        <StatBadge>{kind.label}{kind.target === 'food' ? ` · ${new Date(m.comment_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}</StatBadge>
                        <span style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 700, marginLeft: 'auto' }}>{relativeLabel(m.created_at)}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{m.body}</span>
                      {kind.target === 'chat' && <span style={{ display: 'block', marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent-secondary)' }}>Reply</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {chatWith && (
        <CoachChatModal
          trainerId={chatWith.id}
          trainerName={chatWith.name}
          trainerLogoUrl={chatWith.coach_logo_url}
          onClose={() => setChatWith(null)}
        />
      )}
    </div>
  );
}
