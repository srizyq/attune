import { useState } from 'react';
import { pendingMilestone, markMilestoneDone as write } from '../../lib/communityMilestones';

// "7 days in a row — share it?" A gentle card; nothing posts unless you tap Share.
export default function MilestonePrompt({ streak, onShare }) {
  const [, force] = useState(0);
  const milestone = pendingMilestone(streak);
  if (!milestone) return null;
  const dismiss = () => { write(milestone); force((n) => n + 1); };
  return (
    <section aria-label="Streak milestone" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 'var(--card-radius)', padding: '12px 14px', marginBottom: 16 }}>
      <i className="ti ti-flame" aria-hidden="true" style={{ fontSize: 26, color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>{milestone} days in a row</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Want to share it with your friends?</div>
      </div>
      <button type="button" onClick={() => { write(milestone); onShare(milestone); force((n) => n + 1); }} style={{ background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', minHeight: 36 }}>Share</button>
      <button type="button" aria-label="Dismiss" onClick={dismiss} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', minWidth: 36, minHeight: 36 }}><i className="ti ti-x" /></button>
    </section>
  );
}
