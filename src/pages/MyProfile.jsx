import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/community/Avatar';
import { CommunityProfileView } from './CommunityProfile';
import { ageGate } from '../lib/communityText';

// Settings → Profile. Your own Community profile (picture, @username, bio,
// counts, posts) for anyone who has joined. For everyone else — not joined
// yet, too young, or Community not switched on — the same layout with just
// your name and email. Name, body stats, account and theme are under
// Settings → Personal details.
function Shell({ children }) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="profile" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Profile" onBack={() => navigate('/settings')} backLabel="Back to Settings" />
        <div className="page-pad">{children}</div>
      </div>
    </div>
  );
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 11px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' };

function BasicProfile({ canJoin }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const pending = !!user?.is_anonymous && !!user?.new_email;
  const email = pending ? user.new_email : user?.email;
  return (
    <Shell>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Avatar name={profile?.name || 'A'} size={84} />
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22, margin: '10px 0 0', overflowWrap: 'anywhere' }}>{profile?.name || 'Your name'}</h2>
        {email && <div style={{ fontSize: 14, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{email}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '16px 0' }}>
        <span style={chip}>{pending ? 'Confirming email' : 'Member'}</span>
      </div>
      {canJoin && (
        <button type="button" onClick={() => navigate('/community')} style={{ display: 'block', width: '100%', minHeight: 44, padding: '11px 14px', borderRadius: 14, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Join Community</button>
      )}
    </Shell>
  );
}

export default function MyProfile() {
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const { me, loading, refetch } = useCommunity({ enabled });
  if (!ready || (enabled && loading)) return <Shell><p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p></Shell>;
  if (enabled && me) return <CommunityProfileView key={me.username} username={me.username} own onRenamed={refetch} />;
  return <BasicProfile canJoin={enabled && ageGate(profile, new Date()) === 'ok'} />;
}
