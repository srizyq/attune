import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useTheme } from '../hooks/useTheme';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { supabase, emailRedirectTo } from '../lib/supabase';
import { authedPost } from '../lib/billing';
import AppNav from '../components/AppNav';
import { Card, SectionLabel, FieldRow } from '../components/settings/primitives';

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
// pattern, different plan and profile field.
function ProBillingButton({ profile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = profile?.is_premium
        ? await authedPost('/api/create-portal-session')
        : await authedPost('/api/create-checkout-session', { plan: 'pro' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: '9px 16px',
          background: profile?.is_premium ? 'transparent' : 'var(--accent)',
          border: `1px solid ${profile?.is_premium ? 'var(--border-default)' : 'var(--accent)'}`,
          borderRadius: 8, color: profile?.is_premium ? 'var(--text-secondary)' : '#0f0f0f',
          fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {loading ? 'Loading…' : profile?.is_premium ? 'Manage billing' : 'Upgrade to Pro'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

// Shown instead of UpgradeForm once "Create account" has already been
// submitted — asking for email/password again would be redundant (and
// confusing, since re-submitting the same email errors as "already
// registered"). All that's left to do is confirm the email that's
// already on file, or resend it if it didn't arrive.
function ResendConfirmation({ email }) {
  const [state, setState] = useState(null);

  async function resend() {
    setState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
    setState(error ? (error.message || 'Could not resend — try again.') : 'sent');
  }

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.5 }}>
        Check <span style={{ color: 'var(--text-secondary)' }}>{email}</span> for a confirmation link — everything you've already logged stays right where it is.
      </p>
      {state === 'sent' ? (
        <span style={{ color: 'var(--accent)', fontSize: '13px' }}>Confirmation email sent.</span>
      ) : (
        <button
          onClick={resend}
          disabled={state === 'sending'}
          style={{
            padding: '9px 16px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
            borderRadius: '8px', color: 'var(--accent)', fontSize: '13px', fontWeight: 600,
            cursor: state === 'sending' ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {state === 'sending' ? 'Sending…' : 'Resend confirmation email'}
        </button>
      )}
      {state && state !== 'sending' && state !== 'sent' && (
        <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '8px' }}>{state}</div>
      )}
    </div>
  );
}

function UpgradeForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleUpgrade() {
    if (!email || password.length < 8) return;
    setStatus('loading');
    const { error } = await supabase.auth.updateUser({ email, password }, { emailRedirectTo });
    if (error) { setStatus(error.message); return; }
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <p style={{ color: 'var(--accent)', fontSize: '13px', margin: 0 }}>
        Almost there — check your email to confirm the address, then you're a full account with all your guest data intact.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 6px' }}>Upgrade to a real account — keeps everything you've logged so far.</p>
      <input
        type="email" placeholder="Email address" value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none' }}
      />
      <input
        type="password" placeholder="Password (min. 8 characters)" value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none' }}
      />
      {status && status !== 'loading' && <span style={{ color: 'var(--danger)', fontSize: '12px' }}>{status}</span>}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, cursor: 'pointer', marginTop: '4px' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <span>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>
        </span>
      </label>
      <button
        onClick={handleUpgrade}
        disabled={!email || password.length < 8 || status === 'loading' || !agreed}
        style={{
          padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)',
          borderRadius: '8px', color: '#0f0f0f', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: '4px',
        }}
      >
        {status === 'loading' ? 'Upgrading…' : 'Create account'}
      </button>
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

  const isGuest = !!user?.is_anonymous;
  const pendingConfirmation = isGuest && !!user?.email;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;
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
    if (isGuest) setShowLogoutConfirm(true);
    else handleLogout();
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="profile" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => navigate('/settings')}
              aria-label="Back to Settings"
              title="Back to Settings"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, display: 'flex', flexShrink: 0 }}
            >
              <i className="ti ti-arrow-left" />
            </button>
            <div>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Profile
              </h2>
              <p style={{ color: 'var(--text-hint)', fontSize: '13px', margin: '2px 0 0' }}>Your personal details and body stats</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              background: saved ? 'var(--accent-bg)' : 'var(--accent)',
              border: `1px solid ${saved ? 'var(--border-active)' : 'var(--accent)'}`,
              borderRadius: '10px',
              color: saved ? 'var(--accent)' : '#0f0f0f',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
            }}
          >
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>

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
              <div style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
                {form.name || 'Your name'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{
                  fontSize: '12px', padding: '3px 10px', borderRadius: '99px',
                  background: isGuest ? '#1a1410' : 'var(--accent-bg)',
                  border: `1px solid ${isGuest ? '#3a2e1e' : 'var(--border-active)'}`,
                  color: isGuest ? 'var(--warning)' : 'var(--accent)',
                }}>
                  {isGuest ? `Guest · ${daysRemaining} days left` : 'Member'}
                </span>
                {!isGuest && user?.email && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{user.email}</span>}
                {pendingConfirmation && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{user.email}</span>}
              </div>
            </div>
          </Card>

          {/* Account — merged in from the old separate Account popup, so
              session/subscription/theme all live under Profile now instead
              of being split across two places. */}
          <Card>
            <SectionLabel>Account</SectionLabel>
            {pendingConfirmation ? <ResendConfirmation email={user.email} /> : isGuest && <UpgradeForm />}
            {isGuest && !pendingConfirmation && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '16px 0 0' }}>
                Already have an account?{' '}
                <span onClick={() => navigate('/login')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                  Log in instead
                </span>{' '}— this guest session's data will be left behind unless you upgrade it first.
              </p>
            )}
            <FieldRow
              label="Pro"
              hint={profile?.is_premium ? `Active subscription · ${profile?.pro_status || 'active'}` : 'Unlimited AI scans, custom micronutrient targets, and more'}
            >
              <ProBillingButton profile={profile} />
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
              {isGuest ? 'Exit guest session' : 'Log out'}
            </button>
          </Card>

          <Card>
            <SectionLabel>Appearance</SectionLabel>
            <FieldRow label="Theme" hint={theme === 'light' ? 'Light — matches most of the day' : 'Dark — easier on the eyes at night'}>
              <div style={{ display: 'flex', gap: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2 }}>
                {[{ id: 'dark', label: 'Dark', icon: 'ti-moon' }, { id: 'light', label: 'Light', icon: 'ti-sun' }].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 18, border: 'none',
                      background: theme === opt.id ? 'var(--accent)' : 'transparent',
                      color: theme === opt.id ? '#0f0f0f' : 'var(--text-muted)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <i className={`ti ${opt.icon}`} style={{ fontSize: 14 }} />
                    {opt.label}
                  </button>
                ))}
              </div>
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
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { value: 'metric',   label: 'Metric (kg/cm)' },
                    { value: 'imperial', label: 'Imperial (lb/in)' },
                  ].map(u => {
                    const sel = form.unit === u.value;
                    return (
                      <button
                        key={u.value}
                        onClick={() => set('unit', u.value)}
                        style={{
                          padding: '8px 12px',
                          background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
                          border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
                          borderRadius: '8px',
                          color: sel ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
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
          <div onClick={e => e.stopPropagation()} className={`modal-panel${logoutConfirmClosing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 10 }}>
              Exit guest session?
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
              You're in guest mode. Guest accounts have no password, so once you exit there's no way to log back into this data — it's gone for good. Create a real account above first if you want to keep it.
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
                Exit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
