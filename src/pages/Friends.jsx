import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFriends } from '../hooks/useFriends';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import PullIndicator from '../components/PullIndicator';
import Toast from '../components/Toast';
import Avatar from '../components/Avatar';
import FriendsTabs from '../components/friends/FriendsTabs';
import Switch from '../components/friends/Switch';
import DaySummary from '../components/friends/DaySummary';
import { friendLink, friendlyFriendsError } from '../lib/friends';
import { todayLocalDate } from '../lib/patterns';
import { shareOrigin } from '../lib/siteUrl';

const card = { background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)' };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' };

function FriendCard({ friend, onOpen }) {
  const { name, hidden, items, totals, targets } = friend;
  return (
    <button type="button" onClick={onOpen} aria-label={`${name}'s day`} style={{ ...card, display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hidden || items === 0 ? 0 : 12 }}>
        <Avatar name={name} size={40} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 16, overflowWrap: 'anywhere' }}>{name}</span>
          {hidden && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Not sharing today</span>}
          {!hidden && items === 0 && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Nothing logged yet today</span>}
        </span>
        <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
      </span>
      {!hidden && items > 0 && <DaySummary compact totals={totals} targets={targets} />}
    </button>
  );
}

export default function Friends() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const today = useMemo(() => todayLocalDate(), []);
  const f = useFriends(today);
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
    content = (
      <>
        {f.friends.length === 0 ? (
          <div style={{ ...card, padding: '22px 18px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 18 }}>No friends yet</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '6px 0 16px' }}>Send your link to a friend to see each other's day here.</p>
            <button type="button" onClick={invite} style={primaryBtn}><i className="ti ti-share-3" aria-hidden="true" />Invite a friend</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 2px 10px' }}>Today</div>
            {f.friends.map((fr) => <FriendCard key={fr.id} friend={fr} onOpen={() => navigate(`/friends/${fr.id}`)} />)}
          </>
        )}

        <div style={{ ...card, padding: '6px 16px', marginTop: 6 }}>
          <Switch id="share-day" title="Share my day with friends" checked={f.shareDay} onChange={guard(f.changeSharing)} />
          <div style={{ borderTop: '1px solid var(--border-default)' }}>
            <Switch id="hide-today" title="Hide today" disabled={!f.shareDay} checked={f.shareDay && f.dayHidden} onChange={guard(f.changeDayHidden)} />
          </div>
        </div>
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
          <FriendsTabs active="friends" />
          {content}
        </div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
