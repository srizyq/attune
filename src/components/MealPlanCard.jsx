import { useMemo, useState } from 'react';
import { useMyMealPlans } from '../hooks/useMealPlans';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import { DAYS, MEALS, dayTotals, groceryList, groceryText, itemToFood, loggedPlanMeals, mealTotals, weekdayKey } from '../lib/mealPlan';

const card = { background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 16, padding: 24, marginBottom: 20 };
const heading = { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' };
const chip = (active) => ({ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", background: active ? 'var(--accent-bg)' : 'var(--bg-primary)', border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`, color: active ? 'var(--accent)' : 'var(--text-muted)' });

function Plan({ plan }) {
  const today = todayLocalDate();
  const todayKey = weekdayKey(today);
  const { meals: loggedByMeal, addFood, refetch } = useFoodLogs(today);
  const logged = useMemo(() => Object.values(loggedByMeal).flat(), [loggedByMeal]);
  const [view, setView] = useState('today');
  const [busyMeal, setBusyMeal] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const days = useMemo(() => plan.days || {}, [plan.days]);
  const coach = plan.trainer?.name || 'Your coach';

  const doneMeals = useMemo(() => loggedPlanMeals(days[todayKey], logged), [days, todayKey, logged]);
  const grocery = useMemo(() => groceryList(days), [days]);

  const logMeal = async (mealKey) => {
    setBusyMeal(mealKey);
    setError(null);
    try {
      for (const item of days[todayKey]?.[mealKey] || []) await addFood(itemToFood(item), mealKey, null);
      await refetch();
    } catch (err) {
      setError(err.message || 'Couldn’t log that — try again.');
      await refetch(); // some items may have gone in before the failure
    } finally {
      setBusyMeal(null);
    }
  };

  const copyGrocery = async () => {
    try { await navigator.clipboard.writeText(groceryText(grocery)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const meals = (dayKey, withLog) => MEALS.map((meal) => {
    const items = days[dayKey]?.[meal.key] || [];
    if (items.length === 0) return null;
    const done = doneMeals.has(meal.key);
    return (
      <div key={meal.key} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{meal.label} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>· {mealTotals(items).calories} kcal</span></span>
          {withLog && (
            <button onClick={() => logMeal(meal.key)} disabled={done || busyMeal !== null} className="btn-press" aria-label={done ? `${meal.label} logged` : `Log ${meal.label}`}
              style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: done ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", background: done ? 'transparent' : 'var(--accent-bg)', border: `1px solid ${done ? 'var(--border-default)' : 'var(--border-active)'}`, color: done ? 'var(--text-muted)' : 'var(--accent)' }}>
              {busyMeal === meal.key ? 'Logging…' : done ? 'Logged ✓' : 'Log this meal'}
            </button>
          )}
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
            <span>{it.name}{it.label ? <span style={{ color: 'var(--text-muted)' }}> ({it.label})</span> : null}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(it.calories || 0)} kcal</span>
          </div>
        ))}
      </div>
    );
  });

  const todayHasMeals = MEALS.some((m) => (days[todayKey]?.[m.key] || []).length > 0);
  const t = dayTotals(days[todayKey]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={heading}>{plan.name}</div>
        <div style={{ display: 'flex', gap: 6 }} role="tablist" aria-label="Meal plan view">
          {[['today', 'Today'], ['week', 'Week'], ['grocery', 'Grocery list']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className="btn-press" style={chip(view === id)}>{label}</button>
          ))}
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px' }}>From {coach}.{plan.notes ? ` ${plan.notes}` : ''}</p>

      {view === 'today' && (
        todayHasMeals ? (
          <>
            {meals(todayKey, true)}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>Today’s plan: {t.calories} kcal · P {t.protein_g}g · C {t.carbs_g}g · F {t.fat_g}g</div>
          </>
        ) : <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nothing planned for today — enjoy the flexibility.</p>
      )}

      {view === 'week' && DAYS.map((d) => {
        const total = dayTotals(days[d.key]);
        const has = MEALS.some((m) => (days[d.key]?.[m.key] || []).length > 0);
        return (
          <details key={d.key} open={d.key === todayKey} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {d.label}{d.key === todayKey ? ' (today)' : ''} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>· {has ? `${total.calories} kcal` : 'rest / free'}</span>
            </summary>
            <div style={{ paddingTop: 10 }}>{has ? meals(d.key, false) : <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Nothing planned.</p>}</div>
          </details>
        );
      })}

      {view === 'grocery' && (
        grocery.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nothing to buy yet.</p> : (
          <>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
              {grocery.map((g) => <li key={g.key}>{g.name}{g.label ? ` (${g.label})` : ''}{g.count > 1 ? ` ×${g.count}` : ''}</li>)}
            </ul>
            <button onClick={copyGrocery} className="btn-press" style={{ ...chip(false), color: 'var(--text-secondary)' }}>{copied ? 'Copied' : 'Copy list'}</button>
          </>
        )
      )}

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
    </div>
  );
}

// The meal plan(s) a coach has set for the signed-in client: today's meals
// with one-tap logging, the week, and a grocery list. Renders nothing when
// there's no plan (or before the database update is applied).
export default function MealPlanCard() {
  const { supported, plans } = useMyMealPlans();
  if (!supported || plans.length === 0) return null;
  return <>{plans.map((p) => <Plan key={p.id} plan={p} />)}</>;
}
