import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import { useCommunityCards } from '../hooks/useCommunityCards';
import { useCommunityPostActions } from '../hooks/useCommunityPostActions';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Toast from '../components/Toast';
import PostCard from '../components/community/PostCard';
import { getSavedPosts } from '../lib/community';

// Posts you've bookmarked. Un-saving one takes it off the list.
export default function CommunitySaved() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const { me, loading: meLoading } = useCommunity({ enabled });
  const list = useCommunityCards(useCallback((before) => getSavedPosts(before), []), { enabled: !!me });
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (m, isError = false) => { setToast(m); setToastError(isError); };
  const { handlers, sheets } = useCommunityPostActions({ list, me, onToast: showToast });
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  if (ready && !enabled) return <Navigate to="/dashboard" replace />;
  if (!meLoading && ready && !me) return <Navigate to="/community" replace />;

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="community" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Saved" onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/community'))} backLabel="Back" />
        <div className="page-pad">
          {list.loading ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
            : list.cards.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', margin: '32px 0' }}>Nothing saved yet. Tap the bookmark on a post to keep it here.</p>
            : list.cards.map((post) => <PostCard key={post.id} post={post} mine={post.author_id === user.id} {...handlers} onSave={async (p) => { await handlers.onSave(p); list.remove(p.id); }} />)}
          {list.hasMore && <button type="button" onClick={list.loadMore} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 14, padding: 12, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Load older posts</button>}
        </div>
      </div>
      {sheets}
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
