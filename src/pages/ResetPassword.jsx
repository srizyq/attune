import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from '../components/PreAuthThemeToggle';

// Landed on from the link in the "reset your password" email. Supabase
// exchanges that link's token for a temporary recovery session via the URL
// fragment the moment this page loads (detectSessionInUrl, on by default)
// — getSession() resolves once that exchange finishes. No session at all
// here means a stale or already-used link, not something to retry.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreAuthTheme();
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        setValidLink(!!session);
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError("Those passwords don't match."); return; }
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    setDone(true);
  }

  return (
    <div data-theme={theme} style={{
      minHeight: 'var(--app-h)', background: 'var(--bg-primary)', display: 'flex',
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
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {checking ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>Checking your link…</p>
          ) : !validLink ? (
            <>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
                Link expired
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center', lineHeight: 1.5 }}>
                This password reset link is invalid or has already been used — request a new one from the login page.
              </p>
              <button
                onClick={() => navigate('/login', { state: { openForgotPassword: true } })}
                style={{
                  width: '100%', padding: '14px', background: 'var(--accent)', border: '1px solid var(--accent)',
                  borderRadius: '10px', color: 'var(--accent-contrast)', fontSize: '15px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Request a new link
              </button>
            </>
          ) : done ? (
            <>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
                Password updated
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
                You're signed in with your new password.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  width: '100%', padding: '14px', background: 'var(--accent)', border: '1px solid var(--accent)',
                  borderRadius: '10px', color: 'var(--accent-contrast)', fontSize: '15px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Continue to Attune →
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
                Set a new password
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '28px', textAlign: 'center' }}>
                Choose something you'll remember this time.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
                  onBlur={e => e.target.style.borderColor = password ? 'var(--border-active)' : 'var(--border-default)'}
                  style={inputStyle(password)}
                  autoComplete="new-password"
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
                  onBlur={e => e.target.style.borderColor = confirmPassword ? 'var(--border-active)' : 'var(--border-default)'}
                  style={inputStyle(confirmPassword)}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div style={{
                  background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: '8px',
                  padding: '10px 14px', fontSize: '13px', color: 'var(--danger)', marginBottom: '16px',
                }}>{error}</div>
              )}

              <button
                type="submit"
                disabled={!password || !confirmPassword || loading}
                style={{
                  width: '100%', padding: '14px',
                  background: password && confirmPassword ? 'var(--accent)' : 'var(--bg-card)',
                  border: `1px solid ${password && confirmPassword ? 'var(--accent)' : 'var(--border-default)'}`,
                  borderRadius: '10px',
                  color: password && confirmPassword ? 'var(--accent-contrast)' : 'var(--text-hint)',
                  fontSize: '15px', fontWeight: 600,
                  cursor: password && confirmPassword && !loading ? 'pointer' : 'not-allowed',
                  fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
                }}
              >
                {loading ? 'Updating…' : 'Update password →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
