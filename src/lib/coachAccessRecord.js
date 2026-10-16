// The events a client can see about their coaching relationship, newest first.
// Only things that actually happened and are recorded: the connection, the
// client's consent, and a coach setting or the client taking back their targets.
import { shortDate } from './coachTargets';

const day = (iso) => shortDate(iso);

export function buildAccessRecord({ link, profile, coachName = 'Your coach' }) {
  const events = [];
  if (link?.created_at) events.push({ id: 'connected', at: link.created_at, text: `Connected with ${coachName}` });
  if (link?.consented_at) events.push({ id: 'consented', at: link.consented_at, text: 'You accepted what they can see and do' });
  else if (link) events.push({ id: 'no-consent', at: null, text: 'Connected before consent was recorded — you were shown what they can access' });

  const ownsTargets = profile?.targets_set_by && profile.targets_set_by === link?.trainer?.id;
  if (ownsTargets && profile.targets_set_at) events.push({ id: 'targets-set', at: profile.targets_set_at, text: `${coachName} set your calorie and macro targets` });
  if (profile?.targets_overridden_at) events.push({ id: 'targets-taken', at: profile.targets_overridden_at, text: 'You took over your calorie and macro targets' });

  return events
    .sort((a, b) => (b.at ? new Date(b.at).getTime() : -Infinity) - (a.at ? new Date(a.at).getTime() : -Infinity))
    .map((e) => ({ ...e, dateLabel: e.at ? day(e.at) : '—' }));
}
