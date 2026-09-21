import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTrialActive, trialDaysLeft, trialJustEnded } from '../lib/trial';

function dismissKey(userId) {
  return `attune_dismissed_trial_banner_${userId}`;
}

// Same shell as GuestBanner right above it (Dashboard.jsx) — a compact,
// dismissible strip, not a modal or a hard block. Two distinct states,
// each with its own dismiss: the countdown re-appears each day it drops
// (dismissing "3 days left" shouldn't silence "1 day left" tomorrow), and
// "trial ended" is a different notice from the countdown that led up to
// it, so dismissing one never silently dismisses the other.
export default function TrialBanner({ profile, userId }) {
  const navigate = useNavigate();
  const daysLeft = trialDaysLeft(profile);
  const showCountdown = isTrialActive(profile) && daysLeft <= 3;
  const showEnded = trialJustEnded(profile);
  const kind = showCountdown ? `countdown_${daysLeft}` : showEnded ? 'ended' : null;

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey(userId)); } catch { return null; }
  });

  if (!kind || dismissed === kind) return null;

  function dismiss() {
    try { localStorage.setItem(dismissKey(userId), kind); } catch { /* best-effort */ }
    setDismissed(kind);
  }

  return (
    <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent)', fontSize: '14px' }}>{showEnded ? '⏳' : '✨'}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {showEnded ? 'Your free Pro trial has ended.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free Pro trial.`}
          <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', marginLeft: '4px', padding: '6px 2px', textDecoration: 'underline' }}>
            {showEnded ? 'Upgrade to keep Pro →' : 'Upgrade now →'}
          </button>
        </span>
      </div>
      <button onClick={dismiss} className="hit-slop" aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>×</button>
    </div>
  );
}
