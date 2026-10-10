import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCoachInbox } from '../hooks/useCoach';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { messageKind, relativeLabel } from '../lib/coachInbox';
import DragSheet from './DragSheet';
import CoachChatModal from './CoachChatModal';
import StatBadge from './StatBadge';

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

// The dashboard's bell: only for people who have a coach. Opens a list of
// everything their coach has sent (general notes, weight notes, a day's food
// notes); a general note opens the two-way chat, the others jump to the page
// they're about. A dot shows while something is newer than the last time the
// list was opened on this device.
export default function CoachInbox() {
  const navigate = useNavigate();
  const { hasCoach, trainers, messages, loading, unread, markSeen } = useCoachInbox();
  const [open, setOpen] = useState(false);
  const [chatWith, setChatWith] = useState(null);
  const { closing, close } = useClosingTransition(() => setOpen(false));

  if (!hasCoach) return null;

  const trainerById = new Map(trainers.map((t) => [t.trainer.id, t.trainer]));

  const openSheet = () => { setOpen(true); markSeen(); };

  const openMessage = (m) => {
    const { target } = messageKind(m);
    const trainer = trainerById.get(m.trainer_id);
    setOpen(false);
    if (target === 'weight') navigate('/expenditure', { state: { scrollTo: 'weight' } });
    else if (target === 'food') navigate('/log', { state: { date: m.comment_date } });
    else setChatWith(trainer ? { id: m.trainer_id, ...trainer } : { id: m.trainer_id });
  };

  return (
    <>
      <button
        onClick={openSheet}
        aria-label={unread > 0 ? `Messages from your coach, ${unread} new` : 'Messages from your coach'}
        title="Messages from your coach"
        style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 18, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
      >
        <i className="ti ti-bell" />
        {unread > 0 && (
          <span data-testid="coach-unread-dot" aria-hidden="true" style={{ position: 'absolute', top: 5, right: 6, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent-secondary)', border: '2px solid var(--bg-card)', boxSizing: 'content-box', transform: 'translate(25%, -25%)' }} />
        )}
      </button>

      {open && (
        <DragSheet title="Coach messages" onClose={close} closing={closing}>
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
                      {kind.target === 'chat' && <span style={{ display: 'block', marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent-secondary)' }}>Reply →</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DragSheet>
      )}

      {chatWith && (
        <CoachChatModal
          trainerId={chatWith.id}
          trainerName={chatWith.name}
          trainerLogoUrl={chatWith.coach_logo_url}
          onClose={() => setChatWith(null)}
        />
      )}
    </>
  );
}
