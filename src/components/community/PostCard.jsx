import { useState } from 'react';
import Avatar from './Avatar';
import CoachBadge from './CoachBadge';
import { mealLabel, timeAgo } from '../../lib/communityPosts';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';

const MACROS = [
  { key: 'protein_g', label: 'Protein', short: 'P', color: 'var(--accent)', kcalPer: 4 },
  { key: 'carbs_g', label: 'Carbs', short: 'C', color: 'var(--water-blue)', kcalPer: 4 },
  { key: 'fat_g', label: 'Fat', short: 'F', color: 'var(--ai-purple)', kcalPer: 9 },
];
const KIND_LABEL = { day: 'Day', meal: 'Meal', recipe: 'Recipe' };
const KIND_ICON = { day: 'ti-target-arrow', meal: 'ti-tools-kitchen-2', recipe: 'ti-chef-hat' };
const COPY_LABEL = { day: 'Copy day', meal: 'Copy to my log', recipe: 'Copy recipe' };
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

function MacroChips({ p }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {MACROS.map((m) => (
        <span key={m.key} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', color: m.color }}>
          {m.short} {Math.round(p[m.key] || 0)}g
        </span>
      ))}
    </div>
  );
}

// Three small cards with a bar each — a macro's share of the calories, so it
// reads as "mostly protein" rather than an invented target.
function MacroBars({ p }) {
  const total = MACROS.reduce((s, m) => s + (Number(p[m.key]) || 0) * m.kcalPer, 0) || 1;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {MACROS.map((m) => (
        <div key={m.key} style={{ flex: 1, minWidth: 0, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '9px 10px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.label}</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16 }}>{Math.round(p[m.key] || 0)}g</div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--border-default)', marginTop: 6 }}>
            <div style={{ width: `${Math.min(100, Math.round(((Number(p[m.key]) || 0) * m.kcalPer / total) * 100))}%`, height: '100%', borderRadius: 3, background: m.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalRing({ pct }) {
  const shown = Math.min(100, pct);
  return (
    <span
      role="img"
      aria-label={`${pct}% of daily goal`}
      style={{ width: 70, height: 70, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${pct > 110 ? 'var(--danger)' : 'var(--accent)'} ${shown * 3.6}deg, var(--border-default) 0)` }}
    >
      <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16 }}>{pct}%</span>
    </span>
  );
}

function Body({ post, photoUrl, checking }) {
  const p = post.payload;
  const label = post.kind === 'meal' && p.meal ? mealLabel(p.meal) : KIND_LABEL[post.kind];

  // Photo-led: a food photo on top with the calories laid over it.
  if (photoUrl) {
    return (
      <>
        <div style={{ position: 'relative', margin: '12px 0 10px', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-subtle)' }}>
          <img src={photoUrl} alt={`${p.title} photo`} style={{ display: 'block', width: '100%', height: 190, objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 12, padding: '4px 9px', borderRadius: 12, background: 'rgba(24,20,18,0.82)', color: '#fff' }}>{label}</span>
          <span style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 13, padding: '5px 10px', borderRadius: 12, background: 'rgba(24,20,18,0.82)', color: '#fff' }}>{fmt(p.calories)} kcal{post.kind === 'recipe' ? ' / serve' : ''}</span>
          {checking && <span style={{ position: 'absolute', left: 10, top: 10, fontSize: 12, padding: '4px 9px', borderRadius: 12, background: 'rgba(24,20,18,0.82)', color: '#fff' }}>Checking photo…</span>}
        </div>
        <div style={{ fontSize: 17 }}>{p.title}</div>
        {post.kind === 'day' && p.partial && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>So far today</div>}
        <MacroChips p={p} />
      </>
    );
  }

  // Stats-led: no photo, so the numbers are the picture.
  if (post.kind === 'day') {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {p.goal_pct != null && <GoalRing pct={p.goal_pct} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17 }}>{p.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{fmt(p.calories)} kcal{p.partial ? ' so far' : ''}{p.goal_pct != null ? ' · of daily goal' : ''}</div>
          </div>
        </div>
        <MacroChips p={p} />
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 17, marginTop: 2, overflowWrap: 'anywhere' }}>{p.title}</div>
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 26, lineHeight: 1, flexShrink: 0 }}>
          {fmt(p.calories)}<span style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)' }}> kcal{post.kind === 'recipe' ? ' / serve' : ''}</span>
        </div>
      </div>
      {post.kind === 'recipe' && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(p.ingredients || []).length} ingredients · makes {p.servings || 1}</div>}
      <MacroBars p={p} />
    </div>
  );
}

const iconBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '6px 4px', fontFamily: 'inherit', minHeight: 36 };

/**
 * One post in a feed or profile. `photoUrl` is passed only for a photo that
 * has been approved; without it the stats-led layout is used.
 */
export default function PostCard({ post, mine, photoUrl = null, onReact, onSave, onCopy, onMenu, onOpenProfile }) {
  const [now] = useState(() => Date.now());
  const signedUrl = useSignedPhotoUrl(photoUrl ? null : post.photo_path);
  const shownPhoto = photoUrl || signedUrl;
  return (
    <article aria-label={`${post.kind} by ${post.username}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '14px 16px', marginBottom: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={post.display_name || post.username} path={post.avatar_path} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {onOpenProfile
              ? <button type="button" onClick={() => onOpenProfile(post.username)} style={{ background: 'none', border: 'none', padding: '4px 0', minHeight: 28, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{post.username}</button>
              : <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.username}</span>}
            {post.is_coach && <CoachBadge />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>
            {timeAgo(post.created_at, now)}{post.edited_at ? ' · edited' : ''}{post.audience === 'followers' ? ' · Followers' : ''}{post.hidden ? ' · Hidden (under review)' : ''}
          </div>
        </div>
        {onMenu && (
          <button type="button" aria-label="More" title="More" onClick={() => onMenu(post)} style={{ ...iconBtn, fontSize: 20, padding: 6 }}>
            <i className="ti ti-dots" />
          </button>
        )}
      </header>

      <Body post={post} photoUrl={shownPhoto} checking={mine && post.photo_status === 'pending'} />
      {mine && post.photo_status === 'rejected' && (
        <p role="status" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Your photo wasn't approved, so it isn't shown. Only safe photos of food can be posted.</p>
      )}

      {post.note && <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{post.note}</p>}

      <footer style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button type="button" aria-pressed={post.my_heart} aria-label={`Heart, ${post.hearts}`} onClick={() => onReact?.(post, 'heart')} style={{ ...iconBtn, color: post.my_heart ? 'var(--accent)' : 'var(--text-muted)' }}>
          <i className="ti ti-heart" style={{ fontSize: 19 }} />{post.hearts > 0 ? post.hearts : ''}
        </button>
        <button type="button" aria-pressed={post.my_flame} aria-label={`Flame, ${post.flames}`} onClick={() => onReact?.(post, 'flame')} style={{ ...iconBtn, color: post.my_flame ? 'var(--accent)' : 'var(--text-muted)' }}>
          <i className="ti ti-flame" style={{ fontSize: 19 }} />{post.flames > 0 ? post.flames : ''}
        </button>
        <button type="button" aria-pressed={post.saved} aria-label={post.saved ? 'Remove from saved' : 'Save'} onClick={() => onSave?.(post)} style={{ ...iconBtn, color: post.saved ? 'var(--accent)' : 'var(--text-muted)' }}>
          <i className="ti ti-bookmark" style={{ fontSize: 19 }} />
        </button>
        <span style={{ flex: 1 }} />
        {!mine && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(post)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 16, padding: '8px 14px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', minHeight: 36 }}
          >
            <i className="ti ti-copy" style={{ fontSize: 15 }} />{COPY_LABEL[post.kind]}{post.copies > 0 ? ` · ${post.copies}` : ''}
          </button>
        )}
        {mine && post.copies > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Copied {post.copies}×</span>}
      </footer>
    </article>
  );
}
export { KIND_ICON };
