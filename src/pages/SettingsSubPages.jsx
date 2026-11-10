import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import NotificationsSection from '../components/settings/NotificationsSection';
import CoachSection from '../components/settings/CoachSection';
import PrivacySection from '../components/settings/PrivacySection';
import ImportDataSection from '../components/settings/ImportDataSection';

// The Settings sections that used to be popups, each now its own routed page
// with the standard header and a back button.
function SettingsSubPage({ title, backTo, backLabel, children }) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="settings" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title={title} onBack={() => navigate(backTo)} backLabel={backLabel} />
        <div className="page-pad" style={{ maxWidth: 640 }}>{children}</div>
      </div>
    </div>
  );
}

export function SettingsNotifications() {
  return <SettingsSubPage title="Notifications" backTo="/settings" backLabel="Back to Settings"><NotificationsSection /></SettingsSubPage>;
}

export function SettingsCoach() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refetch } = useProfile();
  // Returning from Stripe Checkout: the webhook updates the profile
  // server-side almost immediately, but this page's profile state won't know
  // until it refetches, so poll in place.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('coach_pass') !== 'success') return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      refetch();
      if (attempts >= 5) clearInterval(interval);
    }, 1500);
    navigate(location.pathname, { replace: true });
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <SettingsSubPage title="Coach Mode" backTo="/settings" backLabel="Back to Settings"><CoachSection /></SettingsSubPage>;
}

export function SettingsPrivacy() {
  const navigate = useNavigate();
  return <SettingsSubPage title="Privacy" backTo="/settings" backLabel="Back to Settings"><PrivacySection onImport={() => navigate('/settings/privacy/import')} /></SettingsSubPage>;
}

export function SettingsImport() {
  const navigate = useNavigate();
  return <SettingsSubPage title="Import from another app" backTo="/settings/privacy" backLabel="Back to Privacy"><ImportDataSection onClose={() => navigate('/settings/privacy')} /></SettingsSubPage>;
}
