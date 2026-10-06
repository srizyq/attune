import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useCommunityAccess';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Toast from '../components/Toast';
import PersonRow, { FollowButton } from '../components/community/PersonRow';
import { approveFollower, declineFollower, explorePeople, followUser, getFollowRequests, searchPeople, unfollowUser, friendlyCommunityError } from '../lib/community';

const PAGE = 20;
const SORTS = [{ id: 'recent', label: 'Recently active' }, { id: 'followed', label: 'Most followed' }];
const GOALS = [{ id: null, label: 'Any goal' }, { id: 'lose', label: 'Losing weight' }, { id: 'maintain', label: 'Maintaining' }, { id: 'build', label: 'Building muscle' }];
const heading = { fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '22px 0 4px' };
const chipStyle = (on) => ({ minHeight: 36, padding: '7px 14px', borderRadius: 16, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', background: on ? 'var(--accent)' : 'var(--bg-card)', color: on ? 'var(--accent-contrast)' : 'var(--text-secondary)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}` });

export default function CommunityFind() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { enabled, ready } = useCommunityAccess();
  const { me, loading: meLoading } = useCommunity({ enabled });
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [requests, setRequests] = useState([]);
  const [sort, setSort] = useState('recent');
  const [goal, setGoal] = useState(null);
  const [explore, setExplore] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const seq = useRef(0);
  const showToast = (m, isError = false) => { setToast(m); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const searching = q.trim().length >= 2;

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    getFollowRequests().then((r) => { if (!cancelled) setRequests(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [me]);

  const loadExplore = useCallback(async (offset = 0) => {
    const mine = ++seq.current;
    try {
      const rows = await explorePeople({ sort, goal, limit: PAGE, offset });
      if (mine !== seq.current) return;
      setExplore((prev) => (offset ? [...(prev || []), ...rows] : rows));
      setMore(rows.length >= PAGE);
    } catch (err) { console.error(err); if (mine === seq.current) setExplore((p) => p || []); }
  }, [sort, goal]);
  useEffect(() => { if (me) { setExplore(null); loadExplore(0); } }, [me, loadExplore]);

  useEffect(() => {
    if (!searching) { setResults(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchPeople(q.trim()).then((rows) => { if (!cancelled) setResults(rows); }).catch(() => { if (!cancelled) setResults([]); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, searching]);

  if (ready && !enabled) return <Navigate to="/dashboard" replace />;
  if (!meLoading && ready && !me) return <Navigate to="/community" replace />;

  async function toggle(person, follow) {
    setBusy(person.user_id);
    const apply = (rows) => rows && rows.map((r) => (r.user_id === person.user_id ? { ...r, relation: follow ? (person.is_private ? 'requested' : 'following') : 'none' } : r));
    try {
      if (follow) await followUser(user.id, person.user_id); else await unfollowUser(user.id, person.user_id);
      setResults(apply); setExplore(apply);
    } catch (err) { showToast(friendlyCommunityError(err), true); } finally { setBusy(null); }
  }
  async function decide(person, accept) {
    setBusy(person.user_id);
    try {
      if (accept) await approveFollower(user.id, person.user_id); else await declineFollower(user.id, person.user_id);
      setRequests((r) => r.filter((x) => x.user_id !== person.user_id));
      showToast(accept ? `@${person.username} can now see your posts` : 'Request declined');
    } catch (err) { showToast(friendlyCommunityError(err), true); } finally { setBusy(null); }
  }

  const row = (person) => (
    <PersonRow key={person.user_id} person={person} onOpen={(u) => navigate(`/community/u/${u}`)}>
      <FollowButton relation={person.relation} isPrivate={person.is_private} busy={busy === person.user_id} onFollow={() => toggle(person, true)} onUnfollow={() => toggle(person, false)} />
    </PersonRow>
  );

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="community" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Find people" onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/community'))} backLabel="Back" />
        <div className="page-pad">
          <div style={{ position: 'relative' }}>
            <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 18 }} />
            <input
              type="search"
              aria-label="Search people"
              placeholder="Search by name or @username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '13px 14px 13px 42px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {searching ? (
            results === null ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Searching…</p>
              : results.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>Nobody found for "{q.trim()}".</p>
              : <section aria-label="Search results" style={{ marginTop: 8 }}>{results.map(row)}</section>
          ) : (
            <>
              {requests.length > 0 && (
                <section aria-label="Follow requests">
                  <div style={heading}>Follow requests · {requests.length}</div>
                  {requests.map((person) => (
                    <PersonRow key={person.user_id} person={person} onOpen={(u) => navigate(`/community/u/${u}`)}>
                      <button type="button" disabled={busy === person.user_id} onClick={() => decide(person, true)} style={{ minHeight: 36, padding: '7px 14px', borderRadius: 14, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none' }}>Accept</button>
                      <button type="button" disabled={busy === person.user_id} onClick={() => decide(person, false)} style={{ minHeight: 36, padding: '7px 14px', borderRadius: 14, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>Decline</button>
                    </PersonRow>
                  ))}
                </section>
              )}
              <section aria-label="Explore">
                <div style={heading}>Explore</div>
                <div role="group" aria-label="Sort" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0' }}>
                  {SORTS.map((s) => <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)} style={chipStyle(sort === s.id)}>{s.label}</button>)}
                </div>
                <div role="group" aria-label="Goal" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 8px' }}>
                  {GOALS.map((g) => <button key={g.label} type="button" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)} style={chipStyle(goal === g.id)}>{g.label}</button>)}
                </div>
                {explore === null ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
                  : explore.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No public accounts match yet.</p>
                  : explore.map(row)}
                {more && <button type="button" onClick={() => loadExplore(explore.length)} style={{ width: '100%', marginTop: 12, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 14, padding: 12, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Show more</button>}
              </section>
            </>
          )}
        </div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
