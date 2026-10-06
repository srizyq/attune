import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import { useSignedPhotoUrl } from '../hooks/useSignedPhotoUrl';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/SegmentedControl';
import Toast from '../components/Toast';
import ActionSheet from '../components/community/ActionSheet';
import { REPORT_REASONS, friendlyCommunityError, getModReports, isCommunityModerator, modDeletePost, modResolveReport, modSetBanned, modSetPostHidden } from '../lib/community';
import { timeAgo } from '../lib/communityPosts';

const reasonLabel = (id) => REPORT_REASONS.find((r) => r.id === id)?.label || id;
const btn = (kind) => ({
  minHeight: 40, padding: '9px 14px', borderRadius: 14, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
  background: kind === 'primary' ? 'var(--accent)' : 'transparent',
  color: kind === 'primary' ? 'var(--accent-contrast)' : kind === 'danger' ? 'var(--danger)' : 'var(--text-secondary)',
  border: kind === 'primary' ? 'none' : `1px solid ${kind === 'danger' ? 'var(--danger)' : 'var(--border-default)'}`,
});

function Snapshot({ snap }) {
  const photo = useSignedPhotoUrl(snap?.photo_path || null);
  if (!snap) return <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>This report is about the person, not a post.</p>;
  const p = snap.payload || {};
  return (
    <div style={{ marginTop: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{snap.kind} post</div>
      <div style={{ fontSize: 15, marginTop: 2, overflowWrap: 'anywhere' }}>{p.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{Math.round(p.calories || 0)} kcal · P {Math.round(p.protein_g || 0)}g · C {Math.round(p.carbs_g || 0)}g · F {Math.round(p.fat_g || 0)}g</div>
      {snap.note && <p style={{ margin: '8px 0 0', fontSize: 13, overflowWrap: 'anywhere' }}>“{snap.note}”</p>}
      {photo && <img src={photo} alt="Photo on the reported post" style={{ marginTop: 10, width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} />}
    </div>
  );
}

// For the people who review reports (rows in community_moderators). Everyone
// else is sent back to Community.
export default function CommunityModerate() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const [allowed, setAllowed] = useState(null);
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (m, isError = false) => { setToast(m); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  useEffect(() => { if (ready && enabled) isCommunityModerator().then(setAllowed).catch(() => setAllowed(false)); }, [ready, enabled]);

  const load = useCallback(async () => {
    try { setReports(await getModReports(status)); } catch (err) { console.error(err); setReports([]); }
  }, [status]);
  useEffect(() => { if (allowed) { setReports(null); load(); } }, [allowed, load]);

  if (ready && !enabled) return <Navigate to="/dashboard" replace />;
  if (allowed === false) return <Navigate to="/community" replace />;

  async function act(fn, message) {
    try { await fn(); showToast(message); await load(); } catch (err) { showToast(friendlyCommunityError(err), true); }
  }

  const row = (r) => (
    <article key={r.id} aria-label={`Report: ${reasonLabel(r.reason)}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontSize: 15 }}>{reasonLabel(r.reason)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0 }}>{timeAgo(r.created_at)}</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
        @{r.reported_username || 'unknown'}{r.reported_banned ? ' (banned)' : ''} reported by @{r.reporter_username || 'unknown'}
      </div>
      {r.details && <p style={{ margin: '8px 0 0', fontSize: 13, overflowWrap: 'anywhere' }}>“{r.details}”</p>}
      <Snapshot snap={r.post_snapshot} />
      {r.status === 'open' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {r.post_id && <button type="button" style={btn(r.post_hidden ? 'secondary' : 'primary')} onClick={() => act(() => modSetPostHidden(r.post_id, !r.post_hidden), r.post_hidden ? 'Post restored' : 'Post hidden')}>{r.post_hidden ? 'Unhide post' : 'Hide post'}</button>}
          {r.post_id && <button type="button" style={btn('danger')} onClick={() => setConfirm({ title: 'Delete this post for good?', label: 'Delete post', run: () => act(() => modDeletePost(r.post_id, r.post_snapshot?.photo_path), 'Post deleted') })}>Delete post</button>}
          <button type="button" style={btn(r.reported_banned ? 'secondary' : 'danger')} onClick={() => (r.reported_banned
            ? act(() => modSetBanned(r.reported_user_id, false), 'Account restored')
            : setConfirm({ title: `Ban @${r.reported_username}? They lose access to Community and their posts vanish from everyone’s feed.`, label: 'Ban account', run: () => act(() => modSetBanned(r.reported_user_id, true), 'Account banned') }))}>{r.reported_banned ? 'Unban' : 'Ban account'}</button>
          <button type="button" style={btn('secondary')} onClick={() => act(() => modResolveReport(r.id, 'dismissed'), 'Report dismissed')}>Dismiss</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{r.status === 'actioned' ? 'Action taken' : 'Dismissed'}</div>
      )}
    </article>
  );

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="community" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Moderation" subtitle="Reports from the community" onBack={() => navigate('/community')} backLabel="Back" />
        <div className="page-pad">
          <SegmentedControl asTabs ariaLabel="Report status" value={status} onChange={setStatus} options={[{ id: 'open', label: 'Open' }, { id: 'actioned', label: 'Actioned' }, { id: 'dismissed', label: 'Dismissed' }]} style={{ marginBottom: 14 }} />
          {allowed === null || reports === null ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
            : reports.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', margin: '32px 0' }}>{status === 'open' ? 'No open reports. Nice.' : 'Nothing here.'}</p>
            : reports.map(row)}
        </div>
      </div>
      {confirm && <ActionSheet title={confirm.title} actions={[{ label: confirm.label, icon: 'ti-check', danger: true, onSelect: confirm.run }]} onClose={() => setConfirm(null)} />}
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
