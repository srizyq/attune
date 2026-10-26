// What each "weight against the plan" status means to a coach, in plain words
// (see weightPlan in lib/clientInsights.js for how the status is decided).
export const WEIGHT_PLAN_STATUS = {
  'on-track': { label: 'On plan', tone: 'good', note: 'Weight is moving at about the pace they chose.' },
  slow: { label: 'Slower than planned', tone: 'fair', note: 'Moving the right way, but under half the planned pace. Worth checking intake and logging accuracy before changing the plan.' },
  stalled: { label: 'Not moving', tone: 'fair', note: 'Weight has been flat for weeks against a plan to change. Look at logged intake first (are days complete?), then the targets.' },
  'wrong-way': { label: 'Wrong way', tone: 'low', note: 'Weight is heading away from the goal. Check whether logging is complete before assuming the targets are wrong.' },
  fast: { label: 'Faster than planned', tone: 'fair', note: 'Moving well past the planned pace — more of the change may be lean mass. Consider raising calories.' },
  steady: { label: 'Steady', tone: 'good', note: 'Weight is holding steady, as planned.' },
  drifting: { label: 'Drifting', tone: 'fair', note: 'Weight is changing despite a maintenance goal.' },
};
