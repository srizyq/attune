// src/pages/onboarding/Welcome.jsx
import { useNavigate, Link } from 'react-router-dom';
import { usePreAuthTheme } from '../../hooks/usePreAuthTheme';
import PreAuthThemeToggle from '../../components/PreAuthThemeToggle';

// The very first screen — deliberately bare (no progress bar, no step
// counter, no skip link) since it isn't part of the numbered flow yet.
// Matches the user's own sketch: centered wordmark, one button below it.
export default function Welcome() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreAuthTheme();

  return (
    <div data-theme={theme} style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
        <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <span style={{
        fontFamily: "'Syne', sans-serif",
        fontWeight: 700,
        fontSize: 'clamp(40px, 12vw, 64px)',
        color: 'var(--text-primary)',
        letterSpacing: '-1px',
        marginBottom: '48px',
      }}>
        attune
      </span>

      <button
        onClick={() => navigate('/onboarding/step1')}
        style={{
          width: '100%',
          maxWidth: '320px',
          padding: '18px',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: '12px',
          color: '#0f0f0f',
          fontSize: '16px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Let's begin
      </button>

      <Link
        to="/login"
        style={{
          marginTop: '20px',
          color: 'var(--text-muted)',
          fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        Already have an account? <span style={{ color: 'var(--accent)' }}>Log in</span>
      </Link>

      {/* This is the very first screen — including for the guest path,
          where a real (anonymous) account and profile row get created a
          few screens later without ever showing the explicit "I agree"
          checkbox that real signup has. Continuing past here is the
          actual first data-collecting step, so notice belongs here,
          before Step1 asks anything. */}
      <p style={{ marginTop: '28px', maxWidth: '320px', textAlign: 'center', color: 'var(--text-hint)', fontSize: '12px', lineHeight: 1.6 }}>
        By continuing, you agree to our{' '}
        <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>Privacy Policy</a>.
      </p>
    </div>
  );
}
