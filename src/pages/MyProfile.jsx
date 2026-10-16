import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';

// Settings → Profile: your name and email. Body stats, account and theme are
// under Settings → Personal details.
const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 11px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' };

export default function MyProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const pending = !!user?.is_anonymous && !!user?.new_email;
  const email = pending ? user.new_email : user?.email;
  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="profile" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Profile" onBack={() => navigate('/settings')} backLabel="Back to Settings" />
        <div className="page-pad">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Avatar name={profile?.name || 'A'} size={84} />
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 22, margin: '10px 0 0', overflowWrap: 'anywhere' }}>{profile?.name || 'Your name'}</h2>
            {email && <div style={{ fontSize: 14, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{email}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '16px 0' }}>
            <span style={chip}>{pending ? 'Confirming email' : 'Member'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
