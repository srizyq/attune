import Avatar from '../Avatar';

const SIZE = 64;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

// A friend as an avatar inside a ring that fills toward their calorie target
// for the day. Dashed when they aren't sharing; plain when there is no target.
function Circle({ friend, onOpen }) {
  const cal = friend.totals?.calories ?? 0;
  const target = friend.targets?.calories > 0 ? friend.targets.calories : null;
  const pct = !friend.hidden && target ? Math.min(1, cal / target) : 0;
  const first = String(friend.name || 'Friend').split(/\s+/)[0];
  return (
    <button
      type="button" onClick={onOpen} aria-label={`${friend.name}, ${friend.hidden ? 'not sharing today' : target ? `${Math.round(pct * 100)}% of calories` : 'today'}`}
      style={{ width: 76, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'center', flexShrink: 0 }}
    >
      <span style={{ position: 'relative', display: 'block', width: SIZE, height: SIZE, margin: '0 auto' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--chip-bg)" strokeWidth={STROKE} strokeDasharray={friend.hidden ? '3 5' : undefined} />
          {pct > 0 && <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--accent)" strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />}
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar name={friend.name} size={44} />
        </span>
        {friend.hidden && (
          <span aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--card-border)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
            <i className="ti ti-lock" />
          </span>
        )}
      </span>
      <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first}</span>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{friend.hidden ? 'Private' : `${Math.round(cal).toLocaleString()} kcal`}</span>
    </button>
  );
}

// Wraps rather than scrolling sideways, so nothing here can be dragged the wrong way.
export default function FriendCircles({ friends, onOpen }) {
  return (
    <div data-testid="friend-circles" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 6px', marginBottom: 18 }}>
      {friends.map((f) => <Circle key={f.id} friend={f} onOpen={() => onOpen(f)} />)}
    </div>
  );
}
