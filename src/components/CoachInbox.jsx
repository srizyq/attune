import { useNavigate } from 'react-router-dom';
import { useCoachInbox } from '../hooks/useCoach';

// The dashboard's bell: only for people who have a coach. Opens the
// Notifications page; a dot shows while something is newer than the last time
// that page was opened on this device.
export default function CoachInbox() {
  const navigate = useNavigate();
  const { hasCoach, unread } = useCoachInbox();
  if (!hasCoach) return null;
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={unread > 0 ? `Messages from your coach, ${unread} new` : 'Messages from your coach'}
      title="Messages from your coach"
      style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 18, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
    >
      <i className="ti ti-bell" />
      {unread > 0 && (
        <span data-testid="coach-unread-dot" aria-hidden="true" style={{ position: 'absolute', top: 5, right: 6, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent-secondary)', border: '2px solid var(--bg-card)', boxSizing: 'content-box', transform: 'translate(25%, -25%)' }} />
      )}
    </button>
  );
}
