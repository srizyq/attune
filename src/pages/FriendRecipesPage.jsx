import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFriends } from '../hooks/useFriends';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Toast from '../components/Toast';
import FriendRecipes from '../components/friends/FriendRecipes';
import { friendlyFriendsError } from '../lib/friends';
import { todayLocalDate } from '../lib/patterns';

// Everything friends have shared, as a page of its own (it used to be a tab on Friends).
export default function FriendRecipesPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const today = useMemo(() => todayLocalDate(), []);
  const f = useFriends(today);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="friends" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Friends' recipes" onBack={() => navigate('/friends')} backLabel="Back to Friends" />
        <div className="page-pad" style={{ maxWidth: 700 }}>
          {f.loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
          ) : f.error && !f.code ? (
            <div role="alert" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{friendlyFriendsError(f.error)}</div>
          ) : (
            <FriendRecipes friends={f.friends} onToast={showToast} />
          )}
        </div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
