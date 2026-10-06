import Avatar from './Avatar';
import CoachBadge from './CoachBadge';

const GOAL = { lose: 'Losing weight', maintain: 'Maintaining', build: 'Building muscle' };

/**
 * A person in a list (search, Explore, suggestions, requests). `action` is
 * the button on the right — the caller decides what it does.
 */
export default function PersonRow({ person, onOpen, children }) {
  const label = person.goal_type ? GOAL[person.goal_type] : null;
  const body = (
    <>
      <Avatar name={person.display_name || person.username} path={person.avatar_path} size={42} />
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.display_name}</span>
          {person.is_coach && <CoachBadge />}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          @{person.username}{label ? ` · ${label}` : ''}{person.is_private ? ' · Private' : ''}
        </span>
      </span>
    </>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
      {onOpen
        ? <button type="button" onClick={() => onOpen(person.username)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{body}</button>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>{body}</div>}
      {children}
    </div>
  );
}

/** The Follow / Requested / Following button for a person's `relation`. */
export function FollowButton({ relation, isPrivate, busy, onFollow, onUnfollow }) {
  if (relation === 'self') return null;
  const following = relation === 'following';
  const requested = relation === 'requested';
  const label = following ? 'Following' : requested ? 'Requested' : isPrivate ? 'Request' : 'Follow';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={following || requested ? onUnfollow : onFollow}
      aria-label={`${label}${following || requested ? ' (tap to undo)' : ''}`}
      style={{
        flexShrink: 0, minHeight: 36, padding: '7px 14px', borderRadius: 14, fontSize: 13, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
        background: following || requested ? 'transparent' : 'var(--accent)',
        color: following || requested ? 'var(--text-secondary)' : 'var(--accent-contrast)',
        border: following || requested ? '1px solid var(--border-default)' : 'none',
      }}
    >
      {label}
    </button>
  );
}
