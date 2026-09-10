// src/pages/onboarding/Step5.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import OnboardingLayout from '../../components/OnboardingLayout';
import { supabase, emailRedirectTo } from '../../lib/supabase';

// A dedicated gate between "submitted the upgrade form" and "actually in
// the app" — Step4 used to drop straight into /dashboard at this point,
// which was the confusing part: the rest of the app had no way to tell
// this apart from plain guest mode (Supabase keeps is_anonymous: true
// until the link is clicked), so it just looked like nothing had
// happened. This screen makes the pending state explicit and — since
// confirming almost always happens in a different tab/app than whichever
// one is sitting on this screen — polls for it instead of requiring a
// manual refresh to notice.
export default function Step5() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || null);
  const [checking, setChecking] = useState(true);
  const [resendState, setResendState] = useState(null); // null | 'sending' | 'sent' | error string
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { navigate('/onboarding/step1', { replace: true }); return; }
      if (!email) setEmail(user.email || null);
      if (!user.is_anonymous) {
        // Already confirmed — either they clicked the link in this same
        // tab, or they landed/refreshed here after already confirming
        // elsewhere.
        navigate('/dashboard', { replace: true });
        return;
      }
      setChecking(false);
    }

    checkStatus();
    pollRef.current = setInterval(checkStatus, 3000);
    return () => { cancelled = true; clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResend() {
    if (!email) return;
    setResendState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
    setResendState(error ? (error.message || 'Could not resend — try again.') : 'sent');
  }

  if (checking) {
    return (
      <OnboardingLayout step={4} showSkip={false}>
        <p style={{ color: 'var(--text-muted)' }}>Checking your account…</p>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={4} showSkip={false}>
      <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px', background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '28px', margin: '0 auto 24px',
        }}>✉️</div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Verify your email
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '28px' }}>
          We sent a confirmation link to{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{email || 'your email'}</span>.
          Click it to finish setting up your account — this page will move on by itself once you do.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28, color: 'var(--text-hint)', fontSize: 13 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          Waiting for confirmation…
        </div>

        {resendState === 'sent' ? (
          <p style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 20 }}>Confirmation email sent.</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resendState === 'sending' || !email}
            style={{
              padding: '11px 20px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
              borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600,
              cursor: resendState === 'sending' ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 20,
            }}
          >
            {resendState === 'sending' ? 'Sending…' : 'Resend confirmation email'}
          </button>
        )}
        {resendState && resendState !== 'sending' && resendState !== 'sent' && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 20 }}>{resendState}</div>
        )}

        <div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", textDecoration: 'underline' }}
          >
            Skip for now — I'll verify later
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
