import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useMyTrainers, useCoachNote } from '../hooks/useCoach';
import { authedPost } from '../lib/billing';
import CoachNote from './CoachNote';
import CoachChatModal from './CoachChatModal';
import CoachConsentCard from './CoachConsentCard';
import { coachPassButtonLabel } from '../lib/coachPass';

const COACH_PASS_PRICE = 'A$19.99/month';

function CoachPassUpsell({ profile, pendingConfirmation, onGoToProfile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-checkout-session', { plan: 'coach' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(160deg, var(--accent-bg) 0%, var(--bg-subtle) 65%)',
      border: '1px solid var(--border-active)', borderRadius: 16, padding: 24, marginBottom: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Become a coach
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 440, lineHeight: 1.5 }}>
          Get your own dashboard to manage clients' nutrition, weight, and check-ins in one place — {COACH_PASS_PRICE}.
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>
      {/* Signup is already real at this point (RequireAuth's
          isUnsignedGuest gate is the only thing standing between
          "browsing" and "has an account" now) but unconfirmed — a
          subscription started now would still be tied to a session that
          depends on that confirmation completing. Send them to confirm
          it first instead of letting the click reach checkout and bounce
          off the server-side block. */}
      {pendingConfirmation ? (
        <button
          onClick={onGoToProfile}
          className="btn-press"
          style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
        >
          Confirm your email to subscribe
        </button>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="btn-press"
          style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
        >
          {loading ? 'Loading…' : coachPassButtonLabel(profile)}
        </button>
      )}
    </div>
  );
}

function TargetStat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// Client-side "Coach" tab content — consolidates what used to be scattered
// across Settings (connect/disconnect a trainer) and per-page CoachNote
// cards (Dashboard/Progress/Daily Log) into one place, plus an upsell to
// become a coach themselves. Also reused as the "My coach" tab for people
// who already have a Coach Pass but are *also* someone else's client —
// `showUpsell` is false there since they've already subscribed.
export default function ClientCoachHub({ showUpsell = true }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  // RequireAuth's isUnsignedGuest gate means is_anonymous here can only
  // mean "signed up, hasn't confirmed their email yet".
  const pendingConfirmation = !!user?.is_anonymous;
  const location = useLocation();
  const { active, pending, needsNotice, loading: trainersLoading, redeemCode, disconnect, respond } = useMyTrainers();
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  // Which link's accept/decline is in flight, and the last failure — one
  // pair is enough since a person answers one invitation at a time.
  const [respondingId, setRespondingId] = useState(null);
  const [respondError, setRespondError] = useState(null);
  // Set by the /join/ redemption in CoachConsentGate when a stashed code
  // turned out to be expired, used or revoked.
  const arrivalError = location.state?.inviteError || null;

  const { note: weightNote, dismiss: dismissWeight } = useCoachNote('weight');
  const { note: nutritionNote, dismiss: dismissNutrition } = useCoachNote('nutrition');
  const { note: checkinNote, dismiss: dismissCheckin } = useCoachNote('checkin');

  const link = active[0];
  const trainer = link?.trainer;

  const answer = async (linkId, accept) => {
    setRespondingId(linkId);
    setRespondError(null);
    try {
      await respond(linkId, accept);
    } catch (err) {
      setRespondError(err.message || 'Something went wrong — try again.');
    } finally {
      setRespondingId(null);
    }
  };

  // Disconnecting is one click from a button next to "Message coach" and
  // can't be undone from this side (getting back in takes a new invite), so
  // it asks first.
  const confirmDisconnect = (row) => {
    const name = row.trainer?.name || 'your coach';
    if (window.confirm(`Disconnect from ${name}? They'll lose access to your data immediately, and you'd need a new invite to reconnect.`)) {
      disconnect(row.id);
    }
  };

  const handleRedeem = async () => {
    const code = inviteCodeInput.trim();
    if (!code) return;
    setInviteStatus('loading');
    try {
      await redeemCode(code);
      setInviteCodeInput('');
      setInviteStatus(null);
    } catch (err) {
      setInviteStatus(err.message || "Couldn't connect — check the code and try again.");
    }
  };

  const targets = {
    calories: profile?.calorie_target,
    protein: profile?.protein_g,
    carbs: profile?.carbs_g,
    fat: profile?.fat_g,
  };
  const hasTargets = !!(targets.calories || targets.protein || targets.carbs || targets.fat);
  const hasNotes = !!(weightNote || nutritionNote || checkinNote);

  return (
    <div style={{ maxWidth: 900 }}>
      {showUpsell && <CoachPassUpsell profile={profile} pendingConfirmation={pendingConfirmation} onGoToProfile={() => navigate('/profile')} />}

      {arrivalError && (
        <div role="alert" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: 'var(--danger)', fontSize: 13 }}>
          {arrivalError}
        </div>
      )}

      {pending.map(row => (
        <CoachConsentCard
          key={row.id}
          link={row}
          variant="invite"
          busy={respondingId === row.id}
          error={respondError}
          onAccept={() => answer(row.id, true)}
          onDecline={() => answer(row.id, false)}
        />
      ))}

      {needsNotice.map(row => (
        <CoachConsentCard
          key={row.id}
          link={row}
          variant="notice"
          busy={respondingId === row.id}
          error={respondError}
          onAccept={() => answer(row.id, true)}
          onDecline={() => confirmDisconnect(row)}
        />
      ))}

      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>Your trainer</div>
        {trainersLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : trainer ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {trainer.coach_logo_url ? (
                <img src={trainer.coach_logo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontFamily: "'Syne', sans-serif" }}>
                  {(trainer.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{trainer.name || 'Your trainer'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Connected {new Date(link.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setChatOpen(true)} className="btn-press" style={{ padding: '8px 14px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Message coach
              </button>
              <button onClick={() => confirmDisconnect(link)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Disconnect
              </button>
            </div>
          </div>
        ) : pending.length > 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Accept the invitation above to connect.</p>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>Not connected to a trainer yet — paste the invite link or code they gave you.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={inviteCodeInput}
                onChange={e => { setInviteCodeInput(e.target.value); setInviteStatus(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleRedeem(); }}
                placeholder="Invite link or code"
                style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={handleRedeem}
                disabled={!inviteCodeInput.trim() || inviteStatus === 'loading'}
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
              >
                {inviteStatus === 'loading' ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {inviteStatus && inviteStatus !== 'loading' && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{inviteStatus}</p>}
          </>
        )}
      </div>

      {trainer && (
        <>
          {hasTargets && (
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>Your current targets</div>
              <div className="grid-4">
                <TargetStat label="Calories" value={targets.calories ? `${targets.calories}` : '—'} />
                <TargetStat label="Protein" value={targets.protein ? `${targets.protein}g` : '—'} />
                <TargetStat label="Carbs" value={targets.carbs ? `${targets.carbs}g` : '—'} />
                <TargetStat label="Fat" value={targets.fat ? `${targets.fat}g` : '—'} />
              </div>
            </div>
          )}

          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Notes from your coach</div>
          {hasNotes ? (
            <div className="grid-2" style={{ marginBottom: 8 }}>
              {weightNote && <CoachNote note={weightNote} onDismiss={dismissWeight} />}
              {checkinNote && <CoachNote note={checkinNote} onDismiss={dismissCheckin} />}
              {nutritionNote && <CoachNote note={nutritionNote} onDismiss={dismissNutrition} />}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No notes from your coach yet.</p>
          )}
        </>
      )}

      {chatOpen && trainer && (
        <CoachChatModal
          trainerId={trainer.id}
          trainerName={trainer.name}
          trainerLogoUrl={trainer.coach_logo_url}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
