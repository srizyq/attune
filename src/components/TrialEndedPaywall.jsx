import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { trialJustEnded } from '../lib/trial';

function ackKey(userId) {
  return `attune_trial_ended_ack_${userId}`;
}

// A real forced choice when a free month lapses without converting —
// TrialBanner only handles the countdown leading up to this; once it's
// actually over, a quietly dismissible strip was too easy to ignore
// forever. No backdrop-click or escape hatch, unlike CoachConsentGate's
// "decide later" — the two buttons below are the only way out. Shown once
// per account: either choice sets a flag so it never nags again, even
// though trial_ends_at stays in the past for good.
export default function TrialEndedPaywall() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [acked, setAcked] = useState(() => {
    try { return !!localStorage.getItem(ackKey(user?.id)); } catch { return false; }
  });

  // Already on the page either button would send them to — showing a
  // modal on top of it would just be redundant.
  if (location.pathname.startsWith('/pricing')) return null;
  if (!profile || !trialJustEnded(profile) || acked) return null;

  function ack() {
    try { localStorage.setItem(ackKey(user?.id), '1'); } catch { /* best-effort */ }
    setAcked(true);
  }

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
      <div className="modal-panel" style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Your free month has ended
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: '0 0 22px' }}>
          Subscribe to keep unlimited AI scans, full micronutrient tracking, and everything else Pro unlocked — or continue on the free plan.
        </p>
        <button
          onClick={() => { ack(); navigate('/pricing'); }}
          style={{ width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 600, color: 'var(--accent-contrast)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 10 }}
        >
          Upgrade to Pro
        </button>
        <button
          onClick={ack}
          style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '8px' }}
        >
          Continue with Free
        </button>
      </div>
    </div>
  );
}
