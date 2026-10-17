import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from '../components/PreAuthThemeToggle';
import RequireAuth from '../components/RequireAuth';
import Avatar from '../components/Avatar';
import { normalizeFriendCode, stashPendingFriend, previewInvite, addFriend, friendlyFriendsError } from '../lib/friends';

const shell = { minHeight: 'var(--app-h)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' };
const button = (primary) => ({
  display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none', minHeight: 48,
  padding: '14px', borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
  background: primary ? 'var(--accent)' : 'transparent',
  border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-default)'}`,
  color: primary ? 'var(--accent-contrast)' : 'var(--text-secondary)',
});

// Signed in: who the link is from, and one tap to become friends.
function Confirm({ code }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', person: null, error: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewInvite(code)
      .then((person) => { if (!cancelled) setState(person ? { status: 'ready', person, error: null } : { status: 'invalid', person: null, error: null }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', person: null, error }); });
    return () => { cancelled = true; };
  }, [code]);

  async function add() {
    setBusy(true);
    try {
      const id = await addFriend(code);
      navigate(`/friends/${id}`, { replace: true });
    } catch (error) {
      setState({ status: 'error', person: null, error });
      setBusy(false);
    }
  }

  const { status, person, error } = state;
  return (
    <div style={shell}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          {status === 'loading' && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>}
          {status === 'invalid' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Link not valid</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>That invite link isn't valid any more. Ask your friend to send a new one.</p>
              <Link to="/friends" style={button(false)}>Go to Friends</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Couldn't add friend</h1>
              <p role="alert" style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>{friendlyFriendsError(error)}</p>
              <Link to="/friends" style={button(false)}>Go to Friends</Link>
            </>
          )}
          {status === 'ready' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Avatar name={person.name} size={72} /></div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', overflowWrap: 'anywhere' }}>{person.already ? `You and ${person.name} are friends` : `Add ${person.name} as a friend?`}</h1>
              {person.already ? (
                <div style={{ marginTop: 24 }}>
                  <button type="button" onClick={() => navigate(`/friends/${person.friendId}`, { replace: true })} style={button(true)}>See {person.name}'s day</button>
                </div>
              ) : (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>You'll each see the other's calories, macros and food log for the day, plus shared recipes.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="button" onClick={add} disabled={busy} style={{ ...button(true), opacity: busy ? 0.6 : 1 }}>{busy ? 'Adding…' : 'Add friend'}</button>
                    <Link to="/friends" style={button(false)}>Not now</Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// /friends/join/CODE — a friend's invite link. Public so the code can be kept
// across signing up or in; once signed in it shows who it's from.
export default function JoinFriend() {
  const { code } = useParams();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = usePreAuthTheme();
  const clean = normalizeFriendCode(code);
  // Mirrors RequireAuth: an anonymous session with no email yet is someone
  // mid-onboarding, not a real account that can add a friend.
  const signedIn = !!user && !(user.is_anonymous && !user.new_email);

  useEffect(() => {
    if (clean && !loading && !signedIn) stashPendingFriend(clean);
  }, [clean, loading, signedIn]);

  if (!clean) return <Navigate to="/" replace />;
  if (loading) return null;
  if (signedIn) return <RequireAuth><Confirm code={clean} /></RequireAuth>;

  return (
    <div data-theme={theme} style={shell}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 20, color: 'var(--accent)', letterSpacing: '-0.5px', textDecoration: 'none' }}>attune</Link>
        <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>A friend invited you</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Create an account or log in to add them. Nothing is shared until you do.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/onboarding/welcome" style={button(true)}>Create an account</Link>
            <Link to="/login" style={button(false)}>I already have an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
