import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PersonRow, { FollowButton } from './PersonRow';
import { followUser, unfollowUser, getSuggestions, friendlyCommunityError } from '../../lib/community';

/**
 * A feed with nothing in it yet: how to find people, your invite link, and a
 * short list of public accounts worth following.
 */
export default function FeedEmpty({ me, onToast, onShare }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSuggestions(10).then((rows) => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, []);

  const link = `${window.location.origin}/community/u/${me.username}`;
  async function invite() {
    try {
      if (navigator.share) await navigator.share({ title: 'Follow me on Attune', text: 'Follow me on Attune', url: link });
      else { await navigator.clipboard.writeText(link); onToast('Invite link copied'); }
    } catch (err) {
      if (err?.name !== 'AbortError') onToast('Couldn\'t share the link', true);
    }
  }

  async function toggle(person, follow) {
    setBusy(person.user_id);
    try {
      if (follow) await followUser(user.id, person.user_id); else await unfollowUser(user.id, person.user_id);
      setPeople((rows) => rows.map((r) => (r.user_id === person.user_id ? { ...r, relation: follow ? (person.is_private ? 'requested' : 'following') : 'none' } : r)));
    } catch (err) {
      onToast(friendlyCommunityError(err), true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '18px 18px 16px', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 18 }}>Your feed is empty</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '6px 0 14px' }}>Follow people to see the meals, days and recipes they share. Send friends your link so they can find you.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onShare && (
            <button type="button" onClick={onShare} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
              <i className="ti ti-plus" aria-hidden="true" />Share something
            </button>
          )}
          <button type="button" onClick={invite} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: onShare ? 'transparent' : 'var(--accent)', color: onShare ? 'var(--text-secondary)' : 'var(--accent-contrast)', border: onShare ? '1px solid var(--border-default)' : 'none', borderRadius: 14, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
            <i className="ti ti-share" aria-hidden="true" />Share your invite link
          </button>
          <button type="button" onClick={() => navigate('/community/find')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
            <i className="ti ti-search" aria-hidden="true" />Find people
          </button>
        </div>
      </div>
      {people && people.length > 0 && (
        <section aria-label="Suggested people">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0 2px' }}>People to follow</div>
          {people.map((person) => (
            <PersonRow key={person.user_id} person={person}>
              <FollowButton
                relation={person.relation}
                isPrivate={person.is_private}
                busy={busy === person.user_id}
                onFollow={() => toggle(person, true)}
                onUnfollow={() => toggle(person, false)}
              />
            </PersonRow>
          ))}
        </section>
      )}
    </>
  );
}
