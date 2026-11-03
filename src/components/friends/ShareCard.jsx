import SegmentedControl from '../SegmentedControl';
import Switch from './Switch';
import { ScanCard, Eyebrow, PrimaryButton } from '../scan/ScanKit';
import { SHARE_LEVELS } from '../../lib/friends';

// "Share your day": who sees what (Full meals / Totals only / Private), hiding
// just today, and the invite link. Before the database update only Full and
// Private exist, so Totals only is left out rather than offered and failing.
export default function ShareCard({ level, levelsSupported, dayHidden, onLevel, onHideToday, onInvite, canInvite }) {
  const options = SHARE_LEVELS.filter((l) => levelsSupported || l.id !== 'totals');
  const current = SHARE_LEVELS.find((l) => l.id === level) || SHARE_LEVELS[0];
  return (
    <ScanCard style={{ padding: 18 }}>
      <Eyebrow style={{ marginBottom: 10 }}>Share your day</Eyebrow>
      <SegmentedControl ariaLabel="Who sees my day" value={level} onChange={onLevel} options={options.map((o) => ({ id: o.id, label: o.label }))} />
      <p data-testid="share-hint" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '10px 2px 4px' }}>{current.hint}</p>
      <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6 }}>
        <Switch id="hide-today" title="Hide today" disabled={level === 'private'} checked={level !== 'private' && dayHidden} onChange={onHideToday}>
          Friends see nothing of today, whatever you share.
        </Switch>
      </div>
      {canInvite && (
        <PrimaryButton style={{ marginTop: 6 }} onClick={onInvite}>
          <i className="ti ti-share-3" aria-hidden="true" />Invite a friend
        </PrimaryButton>
      )}
    </ScanCard>
  );
}
