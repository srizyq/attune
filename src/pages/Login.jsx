import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, emailRedirectTo } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from '../components/PreAuthThemeToggle';
import { upsertProfile } from '../lib/db';

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme, touched } = usePreAuthTheme();
  const isGuest = !!user?.is_anonymous;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Signing up leaves the account "unconfirmed" (still an anonymous
  // Supabase user under the hood — see onboarding/Step4 and Step5) until
  // the emailed link is clicked. Someone who skipped that, then comes
  // back on a different device/browser (or after their original guest
  // session got cleared), has no way back to that resend button — it
  // only exists on Step5 and in Settings > Account, both of which need
  // the original session to reach. Without this, signInWithPassword
  // fails here with "Email not confirmed" and there's no way forward,
  // which is exactly what reads as "my password isn't working": the
  // password is correct, the account just was never finished setting up.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  const [resendState, setResendState] = useState(null); // null | 'sending' | 'sent' | error string

  // A real, already-confirmed account landing on a "log in / create an
  // account" screen doesn't make sense — most likely a stale bookmark or
  // a Settings link followed after already being signed in elsewhere.
  useEffect(() => {
    if (user && !isGuest) navigate('/dashboard', { replace: true });
  }, [user, isGuest, navigate]);

  const inputStyle = (filled) => ({
    background: 'var(--bg-subtle)',
    border: `1px solid ${filled ? 'var(--border-active)' : 'var(--border-default)'}`,
    borderRadius: '10px',
    padding: '14px 16px',
    color: 'var(--text-primary)',
    fontSize: '16px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s',
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    setUnconfirmedEmail(null);
    setResendState(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      if (signInError.message === 'Email not confirmed') {
        setUnconfirmedEmail(email);
      } else {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : signInError.message);
      }
      return;
    }
    // Only overwrite the account's saved theme if this person actually
    // touched the toggle on this screen — otherwise a returning user who
    // ignores it would have their real Settings preference silently reset
    // to the default every time they log in.
    if (touched) {
      try { await upsertProfile(data.user.id, { theme }); } catch { /* non-fatal — login still succeeded */ }
    }
    setLoading(false);
    navigate('/dashboard');
  }

  async function handleResend() {
    if (!unconfirmedEmail) return;
    setResendState('sending');
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: unconfirmedEmail, options: { emailRedirectTo } });
    setResendState(resendError ? (resendError.message || 'Could not resend — try again.') : 'sent');
  }

  return (
    <div data-theme={theme} style={{
      minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex',
      flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '20px',
          color: 'var(--accent)', letterSpacing: '-0.5px', textDecoration: 'none',
        }}>attune</Link>
        <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '400px' }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 30px)',
            fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center',
          }}>Welcome back</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: isGuest ? '18px' : '28px', textAlign: 'center' }}>
            Log in to pick up where you left off.
          </p>

          {isGuest && (
            <div style={{ background: '#1a1410', border: '1px solid #3a2e1e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#c09a70', marginBottom: '18px', lineHeight: 1.5 }}>
              You're currently in a guest session. Logging in here replaces it — this guest session's data will be left behind unless you've already upgraded it from Settings.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
              onBlur={e => e.target.style.borderColor = email ? 'var(--border-active)' : 'var(--border-default)'}
              style={inputStyle(email)}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
              onBlur={e => e.target.style.borderColor = password ? 'var(--border-active)' : 'var(--border-default)'}
              style={inputStyle(password)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div style={{
              background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: '8px',
              padding: '10px 14px', fontSize: '13px', color: 'var(--danger)', marginBottom: '16px',
            }}>{error}</div>
          )}

          {unconfirmedEmail && (
            <div style={{
              background: '#1a1410', border: '1px solid #3a2e1e', borderRadius: '8px',
              padding: '10px 14px', fontSize: '13px', color: '#c09a70', marginBottom: '16px', lineHeight: 1.5,
            }}>
              <p style={{ margin: '0 0 8px' }}>Your password is right, but this account was never confirmed — check {unconfirmedEmail} for the confirmation email we sent when you signed up.</p>
              {resendState === 'sent' ? (
                <p style={{ margin: 0, color: 'var(--accent)' }}>Confirmation email sent — check your inbox.</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === 'sending'}
                  style={{
                    background: 'none', border: '1px solid #3a2e1e', borderRadius: 6, padding: '6px 12px',
                    color: '#c09a70', fontSize: 12, fontWeight: 600, cursor: resendState === 'sending' ? 'default' : 'pointer',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {resendState === 'sending' ? 'Sending…' : 'Resend confirmation email'}
                </button>
              )}
              {resendState && resendState !== 'sending' && resendState !== 'sent' && (
                <p style={{ margin: '8px 0 0', color: 'var(--danger)' }}>{resendState}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!email || !password || loading}
            style={{
              width: '100%', padding: '14px',
              background: email && password ? 'var(--accent)' : 'var(--bg-card)',
              border: `1px solid ${email && password ? 'var(--accent)' : 'var(--border-default)'}`,
              borderRadius: '10px',
              color: email && password ? '#0f0f0f' : 'var(--text-hint)',
              fontSize: '15px', fontWeight: 600,
              cursor: email && password && !loading ? 'pointer' : 'not-allowed',
              fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
            }}
          >
            {loading ? 'Logging in…' : 'Log in →'}
          </button>

          <p style={{ color: 'var(--text-hint)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
            New here? <Link to="/onboarding/step1" style={{ color: 'var(--accent)' }}>Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
