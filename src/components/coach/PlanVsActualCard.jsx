import { useEffect, useMemo, useState } from 'react';
import { getFoodLogsForRange } from '../../lib/db';
import { planVsActual } from '../../lib/planVsActual';
import { dateNDaysAgo, dateRange, todayLocalDate } from '../../lib/patterns';
import { planHasItems } from '../../lib/mealPlan';
import { Card, SectionLabel } from './shared';

const STATUS = {
  plan: { symbol: '✓', color: 'var(--accent)', label: 'logged from the plan' },
  other: { symbol: '≈', color: 'var(--gold)', label: 'ate something else' },
  none: { symbol: '✕', color: 'var(--danger)', label: 'nothing logged' },
  pending: { symbol: '·', color: 'var(--text-hint)', label: 'not yet' },
};

// What the client did with the meal plan over the last week. Only shown once a
// plan with meals in it exists.
export default function PlanVsActualCard({ client, plan }) {
  const today = todayLocalDate();
  const [logs, setLogs] = useState(null);
  const [failed, setFailed] = useState(false);
  const hasPlan = !!plan && planHasItems(plan.days);

  useEffect(() => {
    if (!hasPlan) return undefined;
    let cancelled = false;
    setLogs(null);
    setFailed(false);
    getFoodLogsForRange(client.id, dateNDaysAgo(6), today)
      .then((rows) => { if (!cancelled) setLogs(rows); })
      .catch((err) => { console.error('Failed to load logs for the plan comparison:', err); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [client.id, hasPlan, today]);

  const result = useMemo(() => (logs ? planVsActual(plan.days, logs, dateRange(dateNDaysAgo(6), today), today) : null), [logs, plan, today]);
  if (!hasPlan) return null;

  const s = result?.summary;
  return (
    <Card>
      <SectionLabel icon="ti-chart-bar">Last 7 days vs the plan</SectionLabel>
      {failed ? (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>Couldn't load their food log — try again later.</p>
      ) : !result ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : result.days.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nothing was planned for the last 7 days.</p>
      ) : (
        <>
          <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }} data-testid="plan-summary">
            {s.fromPlan} of {s.plannedMeals} planned meals logged from the plan
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
            {s.somethingElse} ate something else · {s.skipped} not logged{s.pending ? ` · ${s.pending} still to come today` : ''}. “From the plan” means they tapped Log on their plan — food they searched for instead counts as something else, since it can't be matched to the plan.
          </p>
          {result.days.map((d) => (
            <div key={d.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.weekday}{d.date === today ? ' (today)' : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Plan {d.planned.calories.toLocaleString()} kcal · ate {d.actual.calories.toLocaleString()} kcal
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {d.meals.map((m) => {
                  const st = STATUS[m.status];
                  return (
                    <span key={m.meal} title={`${m.label}: ${st.label}`} aria-label={`${d.weekday} ${m.label}: ${st.label}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: st.color, border: `1px solid ${st.color}`, borderRadius: 6, padding: '2px 6px' }}>
                      {m.label[0]} {st.symbol}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
