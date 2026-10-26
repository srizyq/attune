// The three numbers at the top of a client's Snapshot, from one row of
// get_client_summaries (so the screen and the client list always agree).
import { weightPlan } from './clientInsights';
import { tolerancePct } from './adherence';

const LB_PER_KG = 2.20462;
const oneDp = (n) => String(Math.round(n * 10) / 10);
const twoDp = (n) => String(Math.round(n * 100) / 100);
const signed = (n, fmt) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

export function weekSummaryTiles(summary, { unit = 'kg' } = {}) {
  if (!summary) return null;
  const logged = Number(summary.days_logged_7d) || 0;
  const hasComplete = summary.days_complete_7d != null;
  const complete = Number(summary.days_complete_7d) || 0;
  // A database without the update has no days_judged_7d: every logged day counts.
  const judged = summary.days_judged_7d != null ? Number(summary.days_judged_7d) || 0 : logged;
  const onTarget = Number(summary.days_on_target_7d) || 0;

  const logging = { id: 'logging', label: 'Logged', value: `${logged}/7`, sub: hasComplete ? `${complete} complete day${complete === 1 ? '' : 's'}` : 'days', tone: 'none' };
  const target = summary.calorie_target
    ? { id: 'target', label: 'On target', value: judged > 0 ? `${onTarget}/${judged}` : '—', sub: judged > 0 ? `days within ${tolerancePct()}%` : 'no full days yet', tone: judged > 0 && onTarget / judged < 0.4 ? 'fair' : 'none' }
    : { id: 'target', label: 'On target', value: '—', sub: 'no calorie target', tone: 'none' };

  const plan = weightPlan(summary);
  const k = unit === 'lb' ? LB_PER_KG : 1;
  const weight = plan
    ? {
        id: 'weight', label: 'Weight', value: `${signed(plan.rate * k, twoDp)}`, status: plan.status,
        sub: plan.planned ? `${unit}/wk · plan ${signed(plan.planned * k, oneDp)}` : `${unit}/wk`,
        tone: plan.status === 'wrong-way' ? 'low' : ['stalled', 'slow', 'fast', 'drifting'].includes(plan.status) ? 'fair' : 'none',
      }
    : { id: 'weight', label: 'Weight', value: '—', sub: summary.goal ? 'needs 4+ weigh-ins' : 'no goal set', tone: 'none' };

  return [logging, target, weight];
}
