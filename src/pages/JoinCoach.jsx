import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from '../components/PreAuthThemeToggle';
import { normalizeInviteCode, stashPendingInvite } from '../lib/coachInvite';

// Landing page for a coach's invite link (/join/CODE). The code is stashed
// in localStorage first — before the person has an account it has to survive
// signup, the emailed confirmation link (a different tab) and login. Once
// they're signed in, CoachConsentGate redeems it, which creates a *pending*
// connection and drops them on the Coach tab to accept or decline; nothing
// about them is shared before that.
export default function JoinCoach() {
  const { code } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreAuthTheme();
  const clean = normalizeInviteCode(code);
  // Mirrors RequireAuth: an anonymous session with no email yet is someone
  // mid-onboarding, not a real account that can accept an invite.
  const signedIn = !!user && !(user.is_anonymous && !user.new_email);

  useEffect(() => {
    if (clean) stashPendingInvite(clean);
  }, [clean]);

  useEffect(() => {
    // Already signed in: the stash is consumed by the gate on the next
    // authenticated page, so just go there.
    if (!loading && signedIn && clean) navigate('/coach', { replace: true });
  }, [loading, signedIn, clean, navigate]);

  if (!clean) return <Navigate to="/" replace />;
  if (loading || signedIn) return null;

  const button = (primary) => ({
    display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none',
    padding: '14px', borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: primary ? 'var(--accent)' : 'transparent',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-default)'}`,
    color: primary ? '#0f0f0f' : 'var(--text-secondary)',
  });

  return (
    <div data-theme={theme} style={{ minHeight: 'var(--app-h)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--accent)', letterSpacing: '-0.5px', textDecoration: 'none' }}>attune</Link>
        <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
            You've been invited
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>
            A coach invited you to connect on Attune. Create an account or log in to see who it is — nothing is shared until you say yes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/onboarding/welcome" style={button(true)}>Create an account</Link>
            <Link to="/login" style={button(false)}>I already have an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
