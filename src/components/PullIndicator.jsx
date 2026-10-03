import { PULL_THRESHOLD } from '../lib/gestures';

// The little circle that slides down as you pull. Zero height and sticky so
// it never moves or resizes the page's own layout — it only draws over it.
export default function PullIndicator({ pull, refreshing }) {
  if (!pull && !refreshing) return null;
  const ready = pull >= PULL_THRESHOLD;
  return (
    <div aria-hidden={!refreshing} role={refreshing ? 'status' : undefined} aria-label={refreshing ? 'Refreshing' : undefined} style={{ position: 'sticky', top: 0, height: 0, zIndex: 30, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
      <div
        data-testid="pull-indicator"
        style={{
          marginTop: 8, width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          transform: `translateY(${Math.max(0, pull - 36)}px)`, opacity: Math.min(1, pull / 40 || 1),
          transition: pull ? 'none' : 'transform 200ms ease, opacity 200ms ease',
        }}
      >
        {refreshing ? (
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <i className="ti ti-arrow-down" style={{ fontSize: 18, transform: `rotate(${ready ? 180 : 0}deg)`, transition: 'transform 150ms ease' }} />
        )}
      </div>
    </div>
  );
}
