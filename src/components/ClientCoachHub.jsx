import { useState } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useMyTrainers, useCoachNote } from '../hooks/useCoach';
import { authedPost } from '../lib/billing';
import CoachNote from './CoachNote';
import CoachChatModal from './CoachChatModal';

const COACH_PASS_PRICE = 'A$19.99/month';

function CoachPassUpsell() {
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
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="btn-press"
        style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
      >
        {loading ? 'Loading…' : 'Start Coach Pass'}
      </button>
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

// Client-side "Coach" tab content for anyone without an active Coach Pass —
// consolidates what used to be scattered across Settings (connect/disconnect
// a trainer) and per-page CoachNote cards (Dashboard/Progress/Daily Log) into
// one place, plus an upsell to become a coach themselves.
export default function ClientCoachHub() {
  const { profile } = useProfile();
  const { trainers, loading: trainersLoading, redeemCode, disconnect } = useMyTrainers();
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  const { note: weightNote, dismiss: dismissWeight } = useCoachNote('weight');
  const { note: nutritionNote, dismiss: dismissNutrition } = useCoachNote('nutrition');
  const { note: checkinNote, dismiss: dismissCheckin } = useCoachNote('checkin');

  const link = trainers[0];
  const trainer = link?.trainer;

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
      <CoachPassUpsell />

      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
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
              <button onClick={() => disconnect(link.id)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>Not connected to a trainer yet — enter the invite code they gave you.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={inviteCodeInput}
                onChange={e => { setInviteCodeInput(e.target.value.toUpperCase()); setInviteStatus(null); }}
                placeholder="Enter invite code"
                style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', textTransform: 'uppercase' }}
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
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
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
