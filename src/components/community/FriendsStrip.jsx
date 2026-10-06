import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { getFeed } from '../../lib/community';
import { useAuth } from '../../hooks/useAuth';
import { timeAgo } from '../../lib/communityPosts';

const KIND = { day: 'shared their day', meal: 'shared a meal', recipe: 'shared a recipe' };

// A small peek at what the people you follow shared lately. Shows nothing when
// there's nothing from anyone else yet — and nothing at all unless you've joined.
export default function FriendsStrip({ me }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getFeed(null, 10).then((rows) => { if (!cancelled) setPosts(rows.filter((r) => r.author_id !== user.id).slice(0, 3)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user.id]);

  if (!me || posts.length === 0) return null;
  return (
    <section aria-label="Friends" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>FRIENDS</span>
        <button type="button" className="hit-slop" onClick={() => navigate('/community')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>See all</button>
      </div>
      {posts.map((p) => (
        <button key={p.id} type="button" onClick={() => navigate('/community')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, background: 'none', border: 'none', padding: '4px 0', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
          <Avatar name={p.display_name || p.username} size={30} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <b style={{ fontWeight: 700 }}>{p.username}</b> <span style={{ color: 'var(--text-secondary)' }}>{KIND[p.kind]}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0 }}>{timeAgo(p.created_at, now)}</span>
        </button>
      ))}
    </section>
  );
}
