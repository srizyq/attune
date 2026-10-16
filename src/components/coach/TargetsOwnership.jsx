import { useAuth } from '../../hooks/useAuth';
import { shortDate } from '../../lib/coachTargets';

// Under a client's calorie and macro targets: whose numbers they are. A coach
// who set them sees "Set by you"; if the client has since taken them over, the
// coach is told here (and in the client list and thread) and can set them again.
export default function TargetsOwnership({ clientData }) {
  const { user } = useAuth();
  const setBy = clientData?.targets_set_by;
  const first = String(clientData?.name || '').trim().split(/\s+/)[0] || 'The client';

  if (setBy) {
    return (
      <p data-testid="targets-owner" style={{ color: 'var(--text-muted)', fontSize: 12, margin: '12px 0 0', lineHeight: 1.5 }}>
        <i className="ti ti-lock" style={{ marginRight: 5 }} />
        {setBy === user?.id ? 'Set by you' : 'Set by a coach on their team'}{clientData.targets_set_at ? ` on ${shortDate(clientData.targets_set_at)}` : ''}. {first} can't change them without taking them over — you'll be told.
      </p>
    );
  }
  if (clientData?.targets_overridden_at) {
    return (
      <p data-testid="targets-owner" role="status" style={{ color: 'var(--gold)', fontSize: 12, margin: '12px 0 0', lineHeight: 1.5 }}>
        <i className="ti ti-alert-circle" style={{ marginRight: 5 }} />
        {first} took these over from you on {shortDate(clientData.targets_overridden_at)}, so they're now {first}'s own numbers. Save targets again to set them back.
      </p>
    );
  }
  return null;
}
