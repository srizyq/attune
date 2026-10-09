import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { authedPost } from '../lib/billing';
import { supabase } from '../lib/supabase';
import { isTrialActive, trialDaysLeft, canClaimFreeMonth, TRIAL_DAYS } from '../lib/trial';
import { COACH_TRIAL_DAYS, COACH_PASS_PRICE, eligibleForCoachTrial, coachPassButtonLabel, coachPassHint } from '../lib/coachPass';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';

const PRO_PRICE = 'A$4.99/month';

const PRO_BENEFITS = [
  'Unlimited AI photo & menu scans (free: 5 photo + 3 menu scans a month)',
  'Full micronutrient tracking — vitamins, minerals, and fat breakdown',
  'Set your own target for every nutrient, not just the default guideline',
  'Slots — log by exact time instead of fixed meal categories',
  'Unlimited saved meals (free: 10)',
  'Longer expenditure trend history',
];

const COACH_BENEFITS = [
  'Includes full Pro access for your own personal tracking — no separate subscription',
  'Unlimited clients',
  'Build and assign custom meal plans',
  'Set personalised nutrition targets per client, including training vs rest days',
  'Custom check-in forms with response tracking',
  'Direct messaging with your clients',
  "Track clients' weight, measurements, and progress photos",
  'Private coaching notes per client',
  'Co-coach a client with a teammate (they have to agree first)',
  'Weekly adherence reports',
];

function Benefit({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
      <i className="ti ti-check" style={{ fontSize: 14, color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

// A plain "Subscribe" click used to go straight to Stripe with nothing in
// our own app ever asking "are you sure" — easy to blow through by
// accident (especially with Stripe's Link autofill on a returning card,
// which can complete checkout in essentially one click) and the reason a
// user ended up paid instead of on the free trial they meant to start.
// This is the one gate every paid checkout (Pro or Coach Pass) now passes
// through first — same modal chrome as Profile.jsx's logout-confirm.
function ConfirmSubscribeModal({ title, body, confirmLabel, busy, onCancel, onConfirm }) {
  const { closing, close } = useClosingTransition(onCancel);
  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 10 }}>
          {title}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={close} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '11px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent-contrast)', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {busy ? 'Loading…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingConfirmationButton({ onGoToProfile }) {
  return (
    <button
      onClick={onGoToProfile}
      style={{ width: '100%', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      Confirm your email to subscribe
    </button>
  );
}

// The one place that actually talks to Stripe (or claims the one-time free
// month) for both plans — every "Upgrade to Pro" / "Become a coach" CTA
// across the app now lands here instead of triggering checkout inline
// wherever it happens to be, so there's a single tested path instead of
// one near-duplicate per paywall.
function ProCard({ profile, pendingConfirmation, paymentsFrozen, onGoToProfile, refetchProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const hasRealSubscription = !!profile?.stripe_pro_subscription_id;
  const isComp = !!profile?.is_premium && !hasRealSubscription && !isTrialActive(profile);

  async function claimFreeMonth() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('start_free_trial');
      if (rpcError) throw rpcError;
      await refetchProfile();
    } catch (err) {
      setError(err.message || "Couldn't start your free month — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-checkout-session', { plan: 'pro' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function manageBilling() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-portal-session');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Coach Pass already includes Pro (see lib/proAccess.js) — someone with an
  // active Coach Pass and no Pro subscription/comp/trial of their own
  // already has every Pro feature for free (canClaimFreeMonth already knows
  // this and won't offer a trial here either). Checking it ahead of the
  // trial/free-month branches means a coach never sees a paid-sounding CTA
  // for something they already get for free.
  const grantedByCoachPass = !!profile?.coach_pass && !hasRealSubscription && !isComp;

  let status = null;
  let action = null;
  if (pendingConfirmation) {
    action = <PendingConfirmationButton onGoToProfile={onGoToProfile} />;
  } else if (hasRealSubscription) {
    status = `Subscribed · ${profile?.pro_status || 'active'}`;
    action = (
      <button onClick={manageBilling} disabled={busy} style={btnStyle('secondary', busy)}>
        {busy ? 'Loading…' : 'Manage billing'}
      </button>
    );
  } else if (isComp) {
    status = 'Comp access — no billing to manage';
  } else if (grantedByCoachPass) {
    status = 'Included with your Coach Pass — no separate subscription needed';
  } else if (paymentsFrozen) {
    // Covers both the paid Subscribe button and the free-trial claim below —
    // neither should be offered while app_settings.payments_frozen is on.
    status = 'Payments are temporarily paused — check back soon.';
  } else if (isTrialActive(profile)) {
    status = `${trialDaysLeft(profile)} day${trialDaysLeft(profile) === 1 ? '' : 's'} left in your free month`;
    action = (
      <button onClick={() => setConfirming(true)} disabled={busy} style={btnStyle('primary', busy)}>
        {busy ? 'Loading…' : 'Subscribe now'}
      </button>
    );
  } else if (canClaimFreeMonth(profile)) {
    action = (
      <button onClick={claimFreeMonth} disabled={busy} style={btnStyle('primary', busy)}>
        {busy ? 'Starting…' : 'Start my free month'}
      </button>
    );
  } else {
    // Already had a free month (it lapsed without converting) — not
    // eligible again, straight to a real subscription.
    action = (
      <button onClick={() => setConfirming(true)} disabled={busy} style={btnStyle('primary', busy)}>
        {busy ? 'Loading…' : `Subscribe — ${PRO_PRICE}`}
      </button>
    );
  }

  return (
    <>
      <Card style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Pro</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{PRO_PRICE}</div>
        {!pendingConfirmation && !paymentsFrozen && canClaimFreeMonth(profile) ? (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 14 }}>First {TRIAL_DAYS} days free, no card required</div>
        ) : (
          <div style={{ marginBottom: 14 }} />
        )}
        <div style={{ flex: 1, marginBottom: 18 }}>
          {PRO_BENEFITS.map((b) => <Benefit key={b}>{b}</Benefit>)}
        </div>
        {status && <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 10, textAlign: 'center' }}>{status}</div>}
        {action}
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{error}</div>}
      </Card>
      {confirming && (
        <ConfirmSubscribeModal
          title={isTrialActive(profile) ? 'Subscribe to Pro now?' : 'Subscribe to Pro?'}
          body={isTrialActive(profile)
            ? `You still have ${trialDaysLeft(profile)} day${trialDaysLeft(profile) === 1 ? '' : 's'} left in your free month. Subscribing now ends that early and starts ${PRO_PRICE} billing right away. You'll be taken to Stripe to enter payment details.`
            : `You're about to start a ${PRO_PRICE} subscription — billing starts immediately. You'll be taken to Stripe to enter payment details. You can cancel any time from Manage billing.`}
          confirmLabel="Continue to payment"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); checkout(); }}
        />
      )}
    </>
  );
}

function CoachCard({ profile, pendingConfirmation, paymentsFrozen, onGoToProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const hasRealSubscription = !!profile?.stripe_subscription_id;
  const isComp = !!profile?.coach_pass && !hasRealSubscription;

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-checkout-session', { plan: 'coach' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function manageBilling() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-portal-session');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  let status = null;
  let action = null;
  if (pendingConfirmation) {
    action = <PendingConfirmationButton onGoToProfile={onGoToProfile} />;
  } else if (hasRealSubscription) {
    status = coachPassHint(profile);
    action = (
      <button onClick={manageBilling} disabled={busy} style={btnStyle('secondary', busy)}>
        {busy ? 'Loading…' : 'Manage billing'}
      </button>
    );
  } else if (isComp) {
    status = 'Comp access — no billing to manage';
  } else if (paymentsFrozen) {
    status = 'Payments are temporarily paused — check back soon.';
  } else {
    action = (
      <button onClick={() => setConfirming(true)} disabled={busy} style={btnStyle('primary', busy)}>
        {busy ? 'Loading…' : coachPassButtonLabel(profile)}
      </button>
    );
  }

  const trialEligible = !paymentsFrozen && eligibleForCoachTrial(profile);

  return (
    <>
      <Card style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Coach Pass</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{COACH_PASS_PRICE}</div>
        {!pendingConfirmation && trialEligible ? (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 14 }}>First {COACH_TRIAL_DAYS} days free</div>
        ) : (
          <div style={{ marginBottom: 14 }} />
        )}
        <div style={{ flex: 1, marginBottom: 18 }}>
          {COACH_BENEFITS.map((b) => <Benefit key={b}>{b}</Benefit>)}
        </div>
        {status && <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 10, textAlign: 'center' }}>{status}</div>}
        {action}
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{error}</div>}
      </Card>
      {confirming && (
        <ConfirmSubscribeModal
          title={trialEligible ? `Start your ${COACH_TRIAL_DAYS}-day free trial?` : 'Subscribe to Coach Pass?'}
          body={trialEligible
            ? `You'll be taken to Stripe to add a card. You won't be charged until the trial ends — cancel any time before then to avoid being billed ${COACH_PASS_PRICE}.`
            : `You're about to start a ${COACH_PASS_PRICE} subscription — billing starts immediately. You'll be taken to Stripe to enter payment details.`}
          confirmLabel="Continue to payment"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); checkout(); }}
        />
      )}
    </>
  );
}

function btnStyle(kind, busy) {
  const primary = kind === 'primary';
  return {
    width: '100%',
    background: primary ? 'var(--accent)' : 'transparent',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: 10,
    padding: '12px',
    fontSize: 13,
    fontWeight: 600,
    color: primary ? 'var(--accent-contrast)' : 'var(--text-secondary)',
    cursor: busy ? 'default' : 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };
}

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading, refetch } = useProfile();
  // null until loaded — kept apart from `loading` below so a frozen check
  // that's slow to answer can't let the old unfrozen cards flash up first.
  const [paymentsFrozen, setPaymentsFrozen] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.from('app_settings').select('payments_frozen').maybeSingle()
      .then(({ data }) => { if (!cancelled) setPaymentsFrozen(!!data?.payments_frozen); })
      .catch(() => { if (!cancelled) setPaymentsFrozen(false); });
    return () => { cancelled = true; };
  }, []);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  // Same as Profile.jsx's own derivation — RequireAuth's isUnsignedGuest
  // gate means is_anonymous here can only mean "signed up, hasn't
  // confirmed their email yet", and new_email is what actually carries
  // that pending address (see Dashboard.jsx's identical comment).
  const pendingConfirmation = !!user?.is_anonymous && !!user?.new_email;

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="pricing" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Plans" subtitle="Compare Pro and Coach Pass" onBack={() => navigate('/dashboard')} backLabel="Back to Dashboard" />
        <div className="page-pad" style={{ maxWidth: 900 }}>
          {loading || paymentsFrozen === null ? null : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <ProCard profile={profile} pendingConfirmation={pendingConfirmation} paymentsFrozen={paymentsFrozen} onGoToProfile={() => navigate('/settings/personal')} refetchProfile={refetch} />
              <CoachCard profile={profile} pendingConfirmation={pendingConfirmation} paymentsFrozen={paymentsFrozen} onGoToProfile={() => navigate('/settings/personal')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
