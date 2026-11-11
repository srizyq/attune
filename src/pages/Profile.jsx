import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useTheme } from '../hooks/useTheme';
import { useResendConfirmation } from '../hooks/useResendConfirmation';
import { authedPost } from '../lib/billing';
import { isTrialActive, trialDaysLeft } from '../lib/trial';
import { hasProAccess } from '../lib/proAccess';
import AppNav from '../components/AppNav';
import { Card, SectionLabel, FieldRow } from '../components/settings/primitives';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/SegmentedControl';

const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark', icon: 'ti-moon' },
  { id: 'light', label: 'Light', icon: 'ti-sun' },
];

// Mirrors CoachModal's CoachPassButton exactly — same subscribe/manage
// pattern, different plan and profile field. Keyed off
// stripe_pro_subscription_id, not is_premium, for "does this account have
// real billing to manage" — is_premium alone is also true for a comp
// grant or an active free trial, neither of which has a Stripe
// subscription behind it, and both need the normal "Upgrade to Pro" →
// checkout flow (a trial especially — that's the whole point of putting a
// clear upgrade path in front of someone mid-trial), not "Manage billing"
// dead-ending on create-portal-session's "No billing account found yet".
function ProBillingButton({ profile, pendingConfirmation, onGoToPricing }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasRealSubscription = !!profile?.stripe_pro_subscription_id;

  // Managing an existing subscription still talks to Stripe directly —
  // starting a new one goes through Pricing.jsx instead, the one place
  // that owns checkout for Pro/Coach now.
  const handleManageBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-portal-session');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Signup is real at this point (email+password already submitted — see
  // RequireAuth's isUnsignedGuest gate, which is the only thing standing
  // between "browsing" and "has an account" now), but the address isn't
  // confirmed yet — a subscription started now would still be tied to a
  // session that depends on that confirmation completing. The
  // ResendConfirmation prompt is right above this card, so point there
  // instead of letting the click reach checkout and bounce off the
  // server-side block.
  if (pendingConfirmation && !profile?.is_premium) {
    return <span style={{ color: 'var(--text-hint)', fontSize: 12, textAlign: 'right', maxWidth: 160 }}>Confirm your email above first</span>;
  }

  // is_premium true with no real subscription and no active trial means
  // it's a comp grant (compGrants.js) — permanent, not something to ever
  // upgrade away from. A trial gets the normal button below instead (see
  // the function comment above).
  if (profile?.is_premium && !hasRealSubscription && !isTrialActive(profile)) {
    return <span style={{ color: 'var(--text-hint)', fontSize: 12, textAlign: 'right', maxWidth: 160 }}>Comp access — no billing to manage</span>;
  }

  // Coach Pass includes Pro (see lib/proAccess.js) — someone with an active
  // Coach Pass and no Pro subscription/comp/trial of their own already has
  // every Pro feature for free. Pointing them at checkout (or dangling a
  // free-trial offer canClaimFreeMonth would otherwise still show) would be
  // offering to sell them something they already have.
  if (!profile?.is_premium && profile?.coach_pass) {
    return <span style={{ color: 'var(--text-hint)', fontSize: 12, textAlign: 'right', maxWidth: 160 }}>Included with your Coach Pass — no billing to manage</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={hasRealSubscription ? handleManageBilling : onGoToPricing}
        disabled={loading}
        style={{
          padding: '9px 16px',
          background: hasRealSubscription ? 'transparent' : 'var(--accent)',
          border: `1px solid ${hasRealSubscription ? 'var(--border-default)' : 'var(--accent)'}`,
          borderRadius: 8, color: hasRealSubscription ? 'var(--text-secondary)' : 'var(--accent-contrast)',
          fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {loading ? 'Loading…' : hasRealSubscription ? 'Manage billing' : 'Upgrade to Pro'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

// Onboarding's signup form has already been submitted by the time an
// is_anonymous account can reach this page at all (see RequireAuth's
// isUnsignedGuest gate) — asking for email/password again here would be
// redundant (and confusing, since re-submitting the same email errors as
// "already registered"). All that's left to do is confirm the email
// that's already on file, or resend it if it didn't arrive.
function ResendConfirmation({ email }) {
  const { status, errorMessage, secondsLeft, canResend, resend } = useResendConfirmation(email);

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.5 }}>
        Check <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{email}</span> for a confirmation link — everything you've already logged stays right where it is.
      </p>
      <button
        onClick={resend}
        disabled={!canResend}
        style={{
          padding: '9px 16px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
          borderRadius: '8px', color: 'var(--accent)', fontSize: '13px', fontWeight: 600,
          cursor: canResend ? 'pointer' : 'default', fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: canResend ? 1 : 0.6,
        }}
      >
        {status === 'sending' ? 'Sending…' : secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend confirmation email'}
      </button>
      {status === 'sent' && (
        <div style={{ color: 'var(--accent)', fontSize: '13px', marginTop: '8px' }}>Confirmation email sent.</div>
      )}
      {status === 'error' && (
        <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
// Settings → Account: plan, theme and the session. Your name and body stats
// live on the Profile page; deleting the account is its own page.
export default function Account() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  // Signing out of an account whose email isn't confirmed locks you out (the
  // password won't work until it is), so only that case asks first — inline
  // in the card, not in a popup.
  const [warnLogout, setWarnLogout] = useState(false);

  // Landed here from Stripe Checkout (Settings hands off `pro=success`
  // since Pro's billing status now lives on this page) — the webhook
  // updates the profile server-side almost immediately, but this page's
  // own `profile` state won't know until it refetches. A couple of
  // retries covers the small gap between the redirect landing and the
  // webhook actually finishing.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('pro') !== 'success') return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      refetchProfile();
      if (attempts >= 5) clearInterval(interval);
    }, 1500);
    navigate(location.pathname, { replace: true });
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const pendingConfirmation = !!user?.is_anonymous && !!user?.new_email;
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const requestLogout = () => {
    if (pendingConfirmation) setWarnLogout(true);
    else handleLogout();
  };

  const outlineBtn = {
    padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)',
    borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
  };

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="settings" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Account" onBack={() => navigate('/settings')} backLabel="Back to Settings" />

        <div className="page-pad">
          <Card>
            <SectionLabel>Plan</SectionLabel>
            {pendingConfirmation && <ResendConfirmation email={user.new_email} />}
            <FieldRow
              label="Pro"
              hint={
                !hasProAccess(profile) ? undefined
                  : profile?.stripe_pro_subscription_id ? `Active subscription · ${profile?.pro_status || 'active'}`
                  : isTrialActive(profile) ? `Free trial — ${trialDaysLeft(profile)} day${trialDaysLeft(profile) === 1 ? '' : 's'} left`
                  : profile?.is_premium ? 'Comp access'
                  : 'Included with your Coach Pass'
              }
            >
              <ProBillingButton profile={profile} pendingConfirmation={pendingConfirmation} onGoToPricing={() => navigate('/pricing')} />
            </FieldRow>
          </Card>

          <Card>
            <SectionLabel>Appearance</SectionLabel>
            <FieldRow label="Theme">
              <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={setTheme} fill={false} />
            </FieldRow>
          </Card>

          <Card>
            <SectionLabel>Session</SectionLabel>
            <FieldRow label="Sign out">
              <button onClick={requestLogout} style={outlineBtn}>Log out</button>
            </FieldRow>
            {warnLogout && (
              <div role="alert" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 14, marginTop: 4 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: '0 0 12px', overflowWrap: 'anywhere' }}>
                  You haven't confirmed {user?.new_email || 'your email'} yet — signing in again with your password won't work until you do. Make sure you can still get to that confirmation email before logging out.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setWarnLogout(false)} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
                  <button onClick={handleLogout} style={{ ...outlineBtn, flex: 1, background: '#3a1414', border: '1px solid #6a2a2a', color: '#e89f9f' }}>Log out anyway</button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionLabel>Danger zone</SectionLabel>
            <FieldRow label="Delete account" hint="Permanently removes your account, logs, photos and any subscription">
              <button
                onClick={() => navigate('/settings/personal/delete')}
                style={{ ...outlineBtn, border: '1px solid #6a2a2a', color: '#e89f9f' }}
              >
                Delete…
              </button>
            </FieldRow>
          </Card>
        </div>
      </div>
    </div>
  );
}
