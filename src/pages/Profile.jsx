import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useTheme } from '../hooks/useTheme';
import { useClosingTransition } from '../hooks/useClosingTransition';
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

const UNIT_OPTIONS = [
  { id: 'metric', label: 'Metric (kg/cm)' },
  { id: 'imperial', label: 'Imperial (lb/in)' },
];

// ─── Reusable bits ──────────────────────────────────────────────────────────────
function TextInput({ value, onChange, type = 'text', suffix, width = '120px' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width,
          padding: '9px 12px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          outline: 'none',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent-dark)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
      />
      {suffix && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{suffix}</span>}
    </div>
  );
}

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
export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { profile, save: saveProfile, refetch: refetchProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { closing: logoutConfirmClosing, close: closeLogoutConfirm } = useClosingTransition(() => setShowLogoutConfirm(false));

  const [form, setForm] = useState({ name: '', unit: 'metric', age: 30, weight: 70, height: 170 });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      unit: profile.unit || 'metric',
      age: profile.age || 30,
      weight: profile.weight || 70,
      height: profile.height || 170,
    });
  }, [profile]);

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

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Onboarding now requires real signup before RequireAuth lets anyone
  // reach this page (see its isUnsignedGuest gate) — is_anonymous here can
  // only mean "submitted the signup form, hasn't clicked the confirmation
  // link yet". new_email (not user?.email, which Supabase leaves empty
  // until the address is actually confirmed) is what actually carries
  // that pending address — using user?.email here made a real signup look
  // identical to never having signed up at all.
  const pendingConfirmation = !!user?.is_anonymous && !!user?.new_email;
  const initials = (form.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const handleSave = async () => {
    await saveProfile({
      name: form.name,
      unit: form.unit,
      age: Number(form.age),
      weight: Number(form.weight),
      height: Number(form.height),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const requestLogout = () => {
    if (pendingConfirmation) setShowLogoutConfirm(true);
    else handleLogout();
  };

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="profile" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <PageHeader
          title="Profile"
          subtitle="Your personal details and body stats"
          onBack={() => navigate('/settings')}
          backLabel="Back to Settings"
          right={
            <button
              onClick={handleSave}
              style={{
                padding: '9px 16px',
                background: saved ? 'var(--accent-bg)' : 'var(--accent)',
                border: `1px solid ${saved ? 'var(--border-active)' : 'var(--accent)'}`,
                borderRadius: '10px',
                color: saved ? 'var(--accent)' : 'var(--accent-contrast)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
              }}
            >
              {saved ? '✓ Saved' : 'Save'}
            </button>
          }
        />

        {/* Content */}
        <div className="page-pad">

          {/* Identity header */}
          <Card style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--accent-bg)', border: '1px solid var(--accent-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
              fontFamily: "'Syne', sans-serif",
            }}>
              {initials}
            </div>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, fontFamily: "'Syne', sans-serif", overflowWrap: 'anywhere' }}>
                {form.name || 'Your name'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{
                  fontSize: '12px', padding: '3px 10px', borderRadius: '99px',
                  background: pendingConfirmation ? '#1a1410' : 'var(--accent-bg)',
                  border: `1px solid ${pendingConfirmation ? '#3a2e1e' : 'var(--border-active)'}`,
                  color: pendingConfirmation ? 'var(--warning)' : 'var(--accent)',
                }}>
                  {pendingConfirmation ? 'Confirming email' : 'Member'}
                </span>
                {!pendingConfirmation && user?.email && <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: 0, overflowWrap: 'anywhere' }}>{user.email}</span>}
                {pendingConfirmation && <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: 0, overflowWrap: 'anywhere' }}>{user.new_email}</span>}
              </div>
            </div>
          </Card>

          {/* Account — merged in from the old separate Account popup, so
              session/subscription/theme all live under Profile now instead
              of being split across two places. */}
          <Card>
            <SectionLabel>Account</SectionLabel>
            {pendingConfirmation && <ResendConfirmation email={user.new_email} />}
            <FieldRow
              label="Pro"
              hint={
                !hasProAccess(profile) ? 'Unlimited AI scans, custom micronutrient targets, and more'
                  : profile?.stripe_pro_subscription_id ? `Active subscription · ${profile?.pro_status || 'active'}`
                  : isTrialActive(profile) ? `Free trial — ${trialDaysLeft(profile)} day${trialDaysLeft(profile) === 1 ? '' : 's'} left`
                  : profile?.is_premium ? 'Comp access'
                  : 'Included with your Coach Pass'
              }
            >
              <ProBillingButton profile={profile} pendingConfirmation={pendingConfirmation} onGoToPricing={() => navigate('/pricing')} />
            </FieldRow>
            <button
              onClick={requestLogout}
              style={{
                marginTop: '16px',
                padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)',
                borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Log out
            </button>
          </Card>

          <Card>
            <SectionLabel>Appearance</SectionLabel>
            <FieldRow label="Theme" hint={theme === 'light' ? 'Light — matches most of the day' : 'Dark — easier on the eyes at night'}>
              <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={setTheme} fill={false} />
            </FieldRow>
          </Card>

          {/* Details + stats, side by side like the rest of the app */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Your details</SectionLabel>
              <FieldRow label="Name">
                <TextInput value={form.name} onChange={v => set('name', v)} width="180px" />
              </FieldRow>
              <FieldRow label="Units">
                <SegmentedControl options={UNIT_OPTIONS} value={form.unit} onChange={v => set('unit', v)} fill={false} />
              </FieldRow>
            </Card>

            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Body stats</SectionLabel>
              <FieldRow label="Age">
                <TextInput value={form.age} onChange={v => set('age', v)} type="number" suffix="years" width="90px" />
              </FieldRow>
              <FieldRow label="Weight">
                <TextInput value={form.weight} onChange={v => set('weight', v)} type="number" suffix={form.unit === 'imperial' ? 'lb' : 'kg'} width="90px" />
              </FieldRow>
              <FieldRow label="Height">
                <TextInput value={form.height} onChange={v => set('height', v)} type="number" suffix={form.unit === 'imperial' ? 'in' : 'cm'} width="90px" />
              </FieldRow>
              <p style={{ color: 'var(--text-hint)', fontSize: '12px', margin: '14px 0 0' }}>
                These feed your calculated calorie target on the Goals tab in Settings.
              </p>
            </Card>
          </div>

        </div>
      </div>

      {showLogoutConfirm && (
        <div onClick={closeLogoutConfirm} className={`modal-backdrop${logoutConfirmClosing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className={`modal-panel${logoutConfirmClosing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 10 }}>
              Log out before confirming your email?
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px', overflowWrap: 'anywhere' }}>
              You haven't confirmed {user?.new_email || 'your email'} yet — signing in again with your password won't work until you do. Make sure you can still get to that confirmation email before logging out.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={closeLogoutConfirm}
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{ flex: 1, padding: '11px', background: '#3a1414', border: '1px solid #6a2a2a', borderRadius: 8, color: '#e89f9f', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Log out anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
