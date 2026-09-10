// src/components/OnboardingLayout.jsx
import { useNavigate } from 'react-router-dom';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from './PreAuthThemeToggle';

export default function OnboardingLayout({ children, step, totalSteps = 4, showSkip = true }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreAuthTheme();
  const progress = (step / totalSteps) * 100;

  return (
    <div data-theme={theme} style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        borderBottom: '1px solid var(--border-default)',
        gap: '16px',
      }}>
        {/* Logo */}
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 700,
          fontSize: '20px',
          color: 'var(--accent)',
          letterSpacing: '-0.5px',
        }}>attune</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Step counter */}
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            step <span style={{ color: 'var(--accent)' }}>{step}</span> of {totalSteps}
          </span>

          <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />

          {/* Skip link — goes to the final step, not straight to /dashboard.
              Skipping mid-flow means no account exists yet, so /dashboard
              would just bounce you right back here via RequireAuth; the
              final step silently creates a guest session (with whatever
              partial answers you did give) before landing you in the app.
              Hidden on screens (like Step5's email-verify gate) that
              already have their own, more specific way out — a generic
              "skip" going back to step 4 wouldn't make sense once an
              account already exists. */}
          {showSkip && (
            <button
              onClick={() => navigate('/onboarding/step4')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '4px 0',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.target.style.color = 'var(--accent)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
            >
              skip for now →
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'var(--border-default)' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent)',
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        {children}
      </div>
    </div>
  );
}
