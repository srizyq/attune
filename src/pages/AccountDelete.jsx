import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { authedPost } from '../lib/billing';
import AppNav from '../components/AppNav';
import { Card } from '../components/settings/primitives';
import PageHeader from '../components/PageHeader';

// Settings → Account → Delete account. A page of its own (not a popup) so the
// warning can't be dismissed by a stray tap.
export default function AccountDelete() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  // Permanent: the server cancels any subscription, removes stored photos and
  // deletes the account (every table cascades from it). The session is dead
  // afterwards, so sign out locally and ignore a failure to tell the server.
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await authedPost('/api/create-portal-session', { action: 'delete-account' });
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
      return;
    }
    try { await signOut(); } catch { /* the account is already gone */ }
    navigate('/');
  };

  const ready = deleteText.trim() === 'DELETE';
  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="settings" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Delete account" onBack={() => navigate('/settings/personal')} backLabel="Back to Account" />
        <div className="page-pad">
          <Card>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 10 }}>Delete your account?</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
              This permanently deletes your food logs, weight and body data, progress photos, goals and settings, and cancels any Pro or Coach Pass subscription. It can't be undone.
            </p>
            <label htmlFor="delete-confirm" style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>Type DELETE to confirm</label>
            <input
              id="delete-confirm" value={deleteText} onChange={e => setDeleteText(e.target.value)} autoCapitalize="characters" autoComplete="off" disabled={deleting}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit', marginBottom: 14 }}
            />
            {deleteError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => navigate('/settings/personal')} disabled={deleting}
                style={{ flex: 1, padding: '11px', minHeight: 44, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount} disabled={deleting || !ready}
                style={{ flex: 1, padding: '11px', minHeight: 44, background: '#3a1414', border: '1px solid #6a2a2a', borderRadius: 8, color: '#e89f9f', fontSize: 14, fontWeight: 600, cursor: deleting || !ready ? 'not-allowed' : 'pointer', opacity: ready ? 1 : 0.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
