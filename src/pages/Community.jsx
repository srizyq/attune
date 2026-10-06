import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import { useCommunityCards } from '../hooks/useCommunityCards';
import { useCommunityPostActions } from '../hooks/useCommunityPostActions';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import PullIndicator from '../components/PullIndicator';
import Toast from '../components/Toast';
import CommunityTabs from '../components/community/CommunityTabs';
import JoinCommunity from '../components/community/JoinCommunity';
import PostCard from '../components/community/PostCard';
import FeedEmpty from '../components/community/FeedEmpty';
import ShareChooser from '../components/community/ShareChooser';
import ShareSheet from '../components/community/ShareSheet';
import { getFeed, getFollowRequests, isCommunityModerator } from '../lib/community';

export default function Community() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const { me, loading: meLoading, join } = useCommunity({ enabled });
  const feed = useCommunityCards(useCallback((before) => getFeed(before), []), { enabled: !!me });
  const [requests, setRequests] = useState(0);
  const [moderator, setModerator] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };
  const { handlers, sheets } = useCommunityPostActions({ list: feed, me, onToast: showToast });
  const [pullRef, pullState] = usePullToRefresh(() => feed.refetch());
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    getFollowRequests().then((r) => { if (!cancelled) setRequests(r.length); }).catch(() => {});
    isCommunityModerator().then((m) => { if (!cancelled) setModerator(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [me]);

  if (ready && !enabled) return <Navigate to="/dashboard" replace />;

  let content;
  if (meLoading || !ready) {
    content = <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>;
  } else if (!me) {
    content = <JoinCommunity profile={profile} onJoin={join} />;
  } else if (feed.loading) {
    content = <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading your feed…</p>;
  } else if (feed.error && !feed.cards.length) {
    content = (
      <div role="alert" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Couldn't load your feed.{' '}
        <button type="button" onClick={feed.refetch} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: 0 }}>Try again</button>
      </div>
    );
  } else if (!feed.cards.length) {
    content = <FeedEmpty me={me} onToast={showToast} onShare={() => setChoosing(true)} />;
  } else {
    content = (
      <>
        {feed.cards.map((post) => (
          <PostCard key={post.id} post={post} mine={post.author_id === user.id} {...handlers} />
        ))}
        {feed.hasMore && (
          <button type="button" onClick={feed.loadMore} disabled={feed.loadingMore} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 14, padding: 12, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>
            {feed.loadingMore ? 'Loading…' : 'Load older posts'}
          </button>
        )}
      </>
    );
  }

  const headerButtons = me && (
    <>
      <button type="button" className="app-icon-btn" aria-label="Share to Community" title="Share to Community" onClick={() => setChoosing(true)} style={{ background: 'var(--accent)', color: 'var(--accent-contrast)', borderColor: 'var(--accent)' }}><i className="ti ti-plus" /></button>
      <button type="button" className="app-icon-btn" aria-label="Find people" title="Find people" onClick={() => navigate('/community/find')} style={{ position: 'relative' }}>
        <i className="ti ti-user-plus" />
        {requests > 0 && <span aria-label={`${requests} follow requests`} style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{requests}</span>}
      </button>
      <button type="button" className="app-icon-btn" aria-label="Saved" title="Saved" onClick={() => navigate('/community/saved')}><i className="ti ti-bookmark" /></button>
      {moderator && <button type="button" className="app-icon-btn" aria-label="Moderation" title="Moderation" onClick={() => navigate('/community/moderate')}><i className="ti ti-shield-check" /></button>}
      <button type="button" className="app-icon-btn" aria-label="Your profile" title="Your profile" onClick={() => navigate(`/community/u/${me.username}`)}><i className="ti ti-user" /></button>
    </>
  );

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="community" initials={initials} />
      <div ref={pullRef} className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PullIndicator {...pullState} />
        <PageHeader title="Community" subtitle={me ? `@${me.username}` : undefined} right={headerButtons || undefined} />
        <div className="page-pad">
          <CommunityTabs active="friends" />
          {content}
        </div>
      </div>
      {sheets}
      {choosing && me && <ShareChooser profile={profile} onClose={() => setChoosing(false)} onPick={(d) => { setChoosing(false); setDraft(d); }} />}
      {draft && me && <ShareSheet key={draft.kind + draft.payload.title} draft={draft} me={me} onClose={() => setDraft(null)} onPosted={(m) => { showToast(m); feed.refetch(); }} />}
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
