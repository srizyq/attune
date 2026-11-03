import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFriends } from '../hooks/useFriends';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import PullIndicator from '../components/PullIndicator';
import Toast from '../components/Toast';
import Avatar from '../components/Avatar';
import FriendsTabs from '../components/friends/FriendsTabs';
import ShareCard from '../components/friends/ShareCard';
import FriendCircles from '../components/friends/FriendCircles';
import FriendRecipes from '../components/friends/FriendRecipes';
import DaySummary from '../components/DaySummary';
import { ScanCard, Eyebrow, Chip, PrimaryButton } from '../components/scan/ScanKit';
import { friendLink, friendlyFriendsError } from '../lib/friends';
import { todayLocalDate } from '../lib/patterns';
import { shareOrigin } from '../lib/siteUrl';

function FriendCard({ friend, onOpen }) {
  const { name, hidden, items, totals, targets, level } = friend;
  const body = !hidden && items > 0;
  return (
    <ScanCard style={{ padding: 0, overflow: 'hidden' }}>
      <button type="button" onClick={onOpen} aria-label={`${name}'s day`} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', background: 'none', border: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: body ? 12 : 0 }}>
          <Avatar name={name} size={40} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 16, overflowWrap: 'anywhere' }}>{name}</span>
            {hidden && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Not sharing today</span>}
            {!hidden && items === 0 && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Nothing logged yet today</span>}
            {body && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{items} item{items === 1 ? '' : 's'} logged</span>}
          </span>
          {level === 'totals' && !hidden && <Chip icon="ti-eye-off">Totals only</Chip>}
          <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
        </span>
        {body && <DaySummary compact totals={totals} targets={targets} />}
      </button>
    </ScanCard>
  );
}

export default function Friends() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const today = useMemo(() => todayLocalDate(), []);
  const f = useFriends(today);
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'recipes' ? 'recipes' : 'friends';
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };
  const [pullRef, pullState] = usePullToRefresh(() => f.refetch());
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  async function invite() {
    if (!f.code) return;
    const url = friendLink(shareOrigin(), f.code);
    try {
      if (navigator.share) await navigator.share({ title: 'Add me on Attune', text: 'Add me as a friend on Attune', url });
      else { await navigator.clipboard.writeText(url); showToast('Invite link copied'); }
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('Couldn\'t share the link', true);
    }
  }

  const guard = (fn) => async (value) => {
    try { await fn(value); } catch (err) { showToast(friendlyFriendsError(err), true); }
  };

  let content;
  if (f.loading) {
    content = <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>;
  } else if (f.error && !f.code) {
    content = (
      <div role="alert" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {friendlyFriendsError(f.error)}{' '}
        <button type="button" onClick={f.refetch} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: 0 }}>Try again</button>
      </div>
    );
  } else {
    content = tab === 'recipes' ? (
      <FriendRecipes friends={f.friends} onToast={showToast} />
    ) : (
      <>
        {f.friends.length === 0 ? (
          <ScanCard style={{ padding: '22px 18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18 }}>No friends yet</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '6px 0 16px' }}>Send your link to a friend to see each other's day here.</p>
            <PrimaryButton onClick={invite}><i className="ti ti-share-3" aria-hidden="true" />Invite a friend</PrimaryButton>
          </ScanCard>
        ) : (
          <>
            <FriendCircles friends={f.friends} onOpen={(fr) => navigate(`/friends/${fr.id}`)} />
            <Eyebrow style={{ margin: '0 2px 10px' }}>Today</Eyebrow>
            {f.friends.map((fr) => <FriendCard key={fr.id} friend={fr} onOpen={() => navigate(`/friends/${fr.id}`)} />)}
          </>
        )}

        <ShareCard
          level={f.shareLevel} levelsSupported={f.levelsSupported} dayHidden={f.dayHidden}
          onLevel={guard(f.changeLevel)} onHideToday={guard(f.changeDayHidden)}
          onInvite={invite} canInvite={f.friends.length > 0 && !!f.code}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="friends" initials={initials} />
      <div ref={pullRef} className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PullIndicator {...pullState} />
        <PageHeader
          title="Friends"
          right={f.code ? <button type="button" className="app-icon-btn" aria-label="Invite a friend" title="Invite a friend" onClick={invite}><i className="ti ti-user-plus" /></button> : undefined}
        />
        <div className="page-pad" style={{ maxWidth: 700 }}>
          <FriendsTabs active={tab} />
          {content}
        </div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
