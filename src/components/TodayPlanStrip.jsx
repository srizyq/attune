import { useNavigate } from 'react-router-dom';
import { useMyMealPlans } from '../hooks/useMealPlans';
import { MEALS, dayTotals, weekdayKey } from '../lib/mealPlan';

// A one-line reminder on the Daily Log of what a coach planned for the day
// being viewed, with a link to the full plan (where meals can be logged).
// Renders nothing without a plan, or when nothing is planned that day.
export default function TodayPlanStrip({ date, style }) {
  const navigate = useNavigate();
  const { supported, plans } = useMyMealPlans();
  const key = weekdayKey(date);
  if (!supported || !key) return null;
  const withMeals = plans.filter((p) => MEALS.some((m) => (p.days?.[key]?.[m.key] || []).length > 0));
  if (withMeals.length === 0) return null;
  const plan = withMeals[0];
  const total = dayTotals(plan.days[key]);
  const names = MEALS.filter((m) => (plan.days[key][m.key] || []).length > 0).map((m) => m.label);

  return (
    <button
      onClick={() => navigate('/coach')}
      className="btn-press"
      aria-label={`Open ${plan.name}`}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit', ...style }}
    >
      <i className="ti ti-calendar-week" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{plan.name}: {total.calories} kcal planned</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{names.join(' · ')}</span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--accent)', flexShrink: 0 }}>Open plan →</span>
    </button>
  );
}
