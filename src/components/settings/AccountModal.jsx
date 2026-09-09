import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useTheme } from '../../hooks/useTheme';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { supabase } from '../../lib/supabase';
import { SettingsModal, Card, SectionLabel, FieldRow, Toggle } from './primitives';

// Shown instead of UpgradeForm once "Create account" has already been
// submitted — asking for email/password again would be redundant (and
// confusing, since re-submitting the same email errors as "already
// registered"). All that's left to do is confirm the email that's
// already on file, or resend it if it didn't arrive.
function ResendConfirmation({ email }) {
  const [state, setState] = useState(null);

  async function resend() {
    setState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setState(error ? (error.message || 'Could not resend — try again.') : 'sent');
  }

  return (
    <div style={{ marginTop: '14px' }}>
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
            cursor: state === 'sending' ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif",
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
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) { setStatus(error.message); return; }
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <p style={{ color: 'var(--accent)', fontSize: '13px', margin: '14px 0 0' }}>
        Almost there — check your email to confirm the address, then you're a full account with all your guest data intact.
      </p>
    );
  }

  return (
    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 6px' }}>Upgrade to a real account — keeps everything you've logged so far.</p>
      <input
        type="email" placeholder="Email address" value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
      />
      <input
        type="password" placeholder="Password (min. 8 characters)" value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
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
          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '4px',
        }}
      >
        {status === 'loading' ? 'Upgrading…' : 'Create account'}
      </button>
    </div>
  );
}

export default function AccountModal({ onClose, closing }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { closing: logoutConfirmClosing, close: closeLogoutConfirm } = useClosingTransition(() => setShowLogoutConfirm(false));

  const isGuest = !!user?.is_anonymous;
  const pendingConfirmation = isGuest && !!user?.email;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const requestLogout = () => {
    if (isGuest) setShowLogoutConfirm(true);
    else handleLogout();
  };

  return (
    <>
      <SettingsModal title="Account" onClose={onClose} closing={closing}>
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Account</SectionLabel>
          <FieldRow label="Status" hint={pendingConfirmation ? 'Pending email confirmation' : isGuest ? `Guest mode · ${daysRemaining} days left` : 'Signed in'}>
            {!isGuest && <span style={{ color: 'var(--accent)', fontSize: '13px' }}>{user?.email}</span>}
            {pendingConfirmation && <span style={{ color: 'var(--accent)', fontSize: '13px' }}>{user.email}</span>}
          </FieldRow>
          {pendingConfirmation ? <ResendConfirmation email={user.email} /> : isGuest && <UpgradeForm />}
          {isGuest && !pendingConfirmation && (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '16px 0 0' }}>
              Already have an account?{' '}
              <span onClick={() => navigate('/login')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                Log in instead
              </span>{' '}— this guest session's data will be left behind unless you upgrade it first.
            </p>
          )}
          <FieldRow label="Pro features" hint="Test toggle — real billing isn't wired up yet">
            <Toggle on={!!profile?.is_premium} onChange={(on) => saveProfile({ is_premium: on })} />
          </FieldRow>
          <button
            onClick={requestLogout}
            style={{
              marginTop: '16px',
              padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)',
              borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {isGuest ? 'Exit guest session' : 'Log out'}
          </button>
        </Card>

        <Card style={{ marginBottom: 0 }}>
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
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <i className={`ti ${opt.icon}`} style={{ fontSize: 14 }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </FieldRow>
        </Card>
      </SettingsModal>

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
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{ flex: 1, padding: '11px', background: '#3a1414', border: '1px solid #6a2a2a', borderRadius: 8, color: '#e89f9f', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                Exit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
