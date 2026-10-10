import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import { useCommunityCards } from '../hooks/useCommunityCards';
import { useCommunityPostActions } from '../hooks/useCommunityPostActions';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/SegmentedControl';
import Toast from '../components/Toast';
import Avatar from '../components/community/Avatar';
import CoachBadge from '../components/community/CoachBadge';
import PostCard from '../components/community/PostCard';
import ActionSheet from '../components/community/ActionSheet';
import ReportSheet from '../components/community/ReportSheet';
import EditProfileSheet from '../components/community/EditProfileSheet';
import PeopleSheet from '../components/community/PeopleSheet';
import BlockedSheet from '../components/community/BlockedSheet';
import { blockUser, followUser, getProfileByUsername, getUserPosts, unfollowUser, friendlyCommunityError } from '../lib/community';
import { todayLocalDate } from '../lib/patterns';

const GOAL = { lose: 'Losing weight', maintain: 'Maintaining', build: 'Building muscle' };
const btn = (primary) => ({ flex: 1, minHeight: 44, padding: '11px 14px', borderRadius: 14, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', background: primary ? 'var(--accent)' : 'transparent', color: primary ? 'var(--accent-contrast)' : 'var(--text-secondary)', border: primary ? 'none' : '1px solid var(--border-default)' });
const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 11px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' };

function Stat({ value, label, onClick }) {
  const inner = (<><span style={{ display: 'block', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 20 }}>{value}</span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span></>);
  return onClick
    ? <button type="button" onClick={onClick} style={{ flex: 1, background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer', padding: '4px 0', minHeight: 44 }}>{inner}</button>
    : <div style={{ flex: 1, textAlign: 'center', padding: '4px 0' }}>{inner}</div>;
}

// `own` = shown as your own profile under Settings → Profile (same screen, different way in).
export function CommunityProfileView({ username, own = false, onRenamed }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const { me, loading: meLoading, update, leave } = useCommunity({ enabled });
  const [person, setPerson] = useState(undefined); // undefined = loading, null = not available
  const [tab, setTab] = useState('posts');
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'edit' | 'report' | 'followers' | 'following'
  const showToast = (m, isError = false) => { setToast(m); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const loadPerson = useCallback(async () => {
    try { setPerson(await getProfileByUsername(username, todayLocalDate())); } catch (err) { console.error(err); setPerson(null); }
  }, [username]);
  useEffect(() => { if (me) loadPerson(); }, [me, loadPerson]);

  const canSeePosts = person && (person.relation === 'self' || person.relation === 'following' || !person.is_private);
  const targetId = person?.user_id;
  const list = useCommunityCards(useCallback((before) => getUserPosts(targetId, before), [targetId]), { enabled: !!canSeePosts });
  const { handlers, sheets } = useCommunityPostActions({ list, me, onToast: showToast });

  if (ready && !enabled) return <Navigate to="/dashboard" replace />;
  if (!meLoading && ready && !me) return <Navigate to="/community" replace />;
  // Your own profile lives under Settings; an old link to it comes here.
  if (!own && person?.relation === 'self') return <Navigate to="/profile" replace />;

  async function toggleFollow(follow) {
    setBusy(true);
    try {
      if (follow) await followUser(user.id, person.user_id); else await unfollowUser(user.id, person.user_id);
      await loadPerson();
      list.refetch();
    } catch (err) { showToast(friendlyCommunityError(err), true); } finally { setBusy(false); }
  }

  const isSelf = person?.relation === 'self';
  const relationLabel = person?.relation === 'following' ? 'Following' : person?.relation === 'requested' ? 'Requested' : person?.is_private ? 'Request to follow' : 'Follow';
  const shown = tab === 'recipes' ? list.cards.filter((c) => c.kind === 'recipe') : list.cards;
  const link = person ? `${window.location.origin}/community/u/${person.username}` : '';
  async function shareProfile() {
    try {
      if (navigator.share) await navigator.share({ title: `@${person.username} on Attune`, url: link });
      else { await navigator.clipboard.writeText(link); showToast('Link copied'); }
    } catch (err) { if (err?.name !== 'AbortError') showToast('Couldn\'t share the link', true); }
  }

  let body;
  if (person === undefined) body = <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>;
  else if (person === null) body = <p role="status" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>This account isn't available.</p>;
  else {
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar name={person.display_name} path={person.avatar_path} size={84} />
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 22, margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>{person.display_name}{person.is_coach && <CoachBadge />}</h2>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>@{person.username}</div>
          {person.bio && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '8px 20px 0', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{person.bio}</p>}
        </div>
        <div style={{ display: 'flex', margin: '16px 0 12px' }}>
          <Stat value={person.posts} label="Posts" />
          <Stat value={person.followers} label="Followers" onClick={isSelf || person.relation === 'following' ? () => setSheet('followers') : undefined} />
          <Stat value={person.following} label="Following" onClick={isSelf || person.relation === 'following' ? () => setSheet('following') : undefined} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {isSelf ? (
            <>
              <button type="button" style={btn(false)} onClick={() => setSheet('edit')}>Edit profile</button>
              <button type="button" style={btn(false)} onClick={shareProfile}>Share profile</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} style={btn(person.relation === 'none')} onClick={() => toggleFollow(person.relation === 'none')} aria-label={relationLabel}>{relationLabel}</button>
              <button type="button" aria-label="More" style={{ ...btn(false), flex: '0 0 48px', padding: 0 }} onClick={() => setSheet('menu')}><i className="ti ti-dots" style={{ fontSize: 20 }} /></button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {person.streak > 0 && <span style={chip}><i className="ti ti-flame" aria-hidden="true" style={{ color: 'var(--burn)' }} />{person.streak}-day streak</span>}
          {person.goal_type && <span style={chip}>{GOAL[person.goal_type]}</span>}
          {person.is_private && <span style={chip}><i className="ti ti-lock" aria-hidden="true" />Private account</span>}
          {person.follows_you && !isSelf && <span style={chip}>Follows you</span>}
        </div>
        {isSelf && <button type="button" onClick={() => setSheet('blocked')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', padding: '8px 0', marginBottom: 8, minHeight: 36 }}>Blocked people</button>}

        {canSeePosts ? (
          <>
            <SegmentedControl asTabs ariaLabel="Posts" value={tab} onChange={setTab} options={[{ id: 'posts', label: 'Posts' }, { id: 'recipes', label: 'Recipes' }]} style={{ marginBottom: 14 }} />
            {list.loading ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
              : shown.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', margin: '24px 0' }}>{tab === 'recipes' ? 'No recipes shared yet.' : 'Nothing shared yet.'}</p>
              : shown.map((post) => <PostCard key={post.id} post={post} mine={post.author_id === user.id} {...handlers} onOpenProfile={undefined} />)}
            {list.hasMore && <button type="button" onClick={list.loadMore} disabled={list.loadingMore} style={{ ...btn(false), width: '100%', flex: 'none', marginBottom: 12 }}>{list.loadingMore ? 'Loading…' : 'Load older posts'}</button>}
          </>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: 20, textAlign: 'center' }}>
            <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 26, color: 'var(--text-muted)' }} />
            <div style={{ fontSize: 15, marginTop: 6 }}>This account is private</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>Follow them to see their posts, once they approve.</div>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active={own ? 'profile' : 'community'} initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title={own ? 'Profile' : isSelf ? 'Your profile' : 'Profile'} onBack={own ? () => navigate('/settings') : () => (window.history.length > 1 ? navigate(-1) : navigate('/community'))} backLabel={own ? 'Back to Settings' : 'Back'} />
        <div className="page-pad">{body}</div>
      </div>
      {sheets}
      {sheet === 'edit' && me && <EditProfileSheet me={me} onLeave={async () => { await leave(); navigate(own ? '/profile' : '/community', { replace: true }); }} onSave={async (fields) => {
        const next = await update(fields);
        const renamed = !!fields.username && fields.username !== username;
        if (renamed && own) { onRenamed?.(); return; } // the page reopens under the new username
        await loadPerson();
        if (renamed) navigate(`/community/u/${next.username}`, { replace: true });
      }} onClose={() => setSheet(null)} onToast={showToast} />}
      {sheet === 'menu' && person && (
        <ActionSheet
          title={`@${person.username}`}
          actions={[
            { label: 'Report', icon: 'ti-flag', onSelect: () => setSheet('report') },
            { label: `Block @${person.username}`, icon: 'ti-ban', danger: true, onSelect: async () => { try { await blockUser(user.id, person.user_id); showToast(`Blocked @${person.username}`); navigate('/community', { replace: true }); } catch (err) { showToast(friendlyCommunityError(err), true); } } },
          ]}
          onClose={() => setSheet((s) => (s === 'menu' ? null : s))}
        />
      )}
      {sheet === 'report' && person && <ReportSheet userId={person.user_id} username={person.username} onClose={() => setSheet(null)} onDone={showToast} />}
      {(sheet === 'followers' || sheet === 'following') && person && <PeopleSheet title={sheet === 'followers' ? 'Followers' : 'Following'} userId={person.user_id} kind={sheet} onClose={() => setSheet(null)} onOpen={(u) => navigate(`/community/u/${u}`)} />}
      {sheet === 'blocked' && <BlockedSheet onClose={() => setSheet(null)} onToast={showToast} />}
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}

// Keyed by username so moving from one profile to another starts fresh.
export default function CommunityProfile() {
  const { username } = useParams();
  return <CommunityProfileView key={username} username={username} />;
}
