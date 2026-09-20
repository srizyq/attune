import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ThemeProvider } from '../context/ThemeProvider';
import CoachConsentGate from './CoachConsentGate';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f0f', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '3px solid #2a2a2a', borderTopColor: '#8fbc8f',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/onboarding/welcome" replace />;

  // is_anonymous alone doesn't distinguish "never touched the signup
  // form" from "submitted it, hasn't clicked the email confirmation link
  // yet" — Supabase keeps is_anonymous true through both, only flipping
  // it once the email is confirmed. new_email is set the moment
  // updateUser({email, password}) succeeds (confirmed live: a test
  // account mid-confirmation had email: "" but new_email: the address
  // just submitted), so it's what actually separates the two. A true
  // guest here means someone who reloaded mid-onboarding, followed a
  // stale link, or is an account that predates this gate — onboarding/
  // Step4 is where the mandatory signup form itself lives, and it
  // already handles resuming an existing anonymous session cleanly (see
  // its own "existingProfile" check) rather than starting over.
  const isUnsignedGuest = user.is_anonymous && !user.new_email;
  if (isUnsignedGuest) return <Navigate to="/onboarding/step4" replace />;

  // Every authenticated page gets theme context from here — nothing
  // outside RequireAuth (marketing, onboarding, login) is theme-aware.
  return (
    <ThemeProvider>
      {children}
      <CoachConsentGate />
    </ThemeProvider>
  );
}
