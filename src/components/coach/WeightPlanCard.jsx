import { Card, SectionLabel } from './shared';
import { weightPlan, describeWeightPlan } from '../../lib/clientInsights';

const STATUS = {
  'on-track': { label: 'On plan', color: 'var(--accent)', note: 'Weight is moving at about the pace they chose.' },
  slow: { label: 'Slower than planned', color: 'var(--gold)', note: 'Moving the right way, but under half the planned pace. Worth checking intake and logging accuracy before changing the plan.' },
  stalled: { label: 'Not moving', color: 'var(--gold)', note: 'Weight has been flat for weeks against a plan to change. Look at logged intake first (are days complete?), then the targets.' },
  'wrong-way': { label: 'Moving the wrong way', color: 'var(--danger)', note: 'Weight is heading away from the goal. Check whether logging is complete before assuming the targets are wrong.' },
  fast: { label: 'Faster than planned', color: 'var(--gold)', note: 'Moving well past the planned pace — more of the change may be lean mass. Consider raising calories.' },
  steady: { label: 'Steady', color: 'var(--accent)', note: 'Weight is holding steady, as planned.' },
  drifting: { label: 'Drifting', color: 'var(--gold)', note: 'Weight is changing despite a maintenance goal.' },
};

// What the client planned to do to their weight, against what the scale says —
// from the same rate the client list uses (median of pairwise slopes over 28
// days), so the number here is the number on the list.
export default function WeightPlanCard({ summary }) {
  const plan = weightPlan(summary);
  const weighIns = Number(summary?.weigh_ins_28d) || 0;
  // Before the database update (or with too few weigh-ins) there's no rate; say
  // what's needed rather than leaving a hole.
  if (!summary || (summary.weight_rate_kg_week === undefined)) return null;
  const meta = plan ? STATUS[plan.status] : null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <SectionLabel icon="ti-scale">Weight vs plan</SectionLabel>
        {meta && <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 18 }} data-testid="weight-plan-status">{meta.label}</span>}
      </div>
      {plan ? (
        <>
          <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, margin: '0 0 6px' }} data-testid="weight-plan-rate">{describeWeightPlan(plan)}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            {meta.note} Based on {weighIns} weigh-in{weighIns === 1 ? '' : 's'} over the last 28 days.
          </p>
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, lineHeight: 1.6 }} data-testid="weight-plan-empty">
          {summary.goal
            ? `Not enough weigh-ins to compare against the plan yet — it needs 4 or more spread over at least 10 days (${weighIns} in the last 28).`
            : 'Set a goal for this client to compare their weight with a plan.'}
        </p>
      )}
    </Card>
  );
}
