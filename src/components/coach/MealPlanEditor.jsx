import { useEffect, useMemo, useState } from 'react';
import { Card, SectionLabel } from './shared';
import { fieldStyle, labelStyle } from './constants';
import { getSavedMeals } from '../../lib/db';
import {
  DAYS, MEALS, LIMITS, cleanDays, copyDay, dayTotals, groceryList, groceryText, mealTotals, newItem, planHasItems, recipeToItem, validateMealPlan,
} from '../../lib/mealPlan';

let keyCounter = 0;
const withKey = (item) => ({ ...item, _k: item._k || `k${++keyCounter}` });
// Give every loaded item a stable React key for the editor (stripped again by cleanDays).
const withKeys = (days) => Object.fromEntries(Object.entries(days || {}).map(([d, meals]) => [d, Object.fromEntries(Object.entries(meals).map(([m, items]) => [m, items.map(withKey)]))]));

const ghost = { padding: '7px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };
const small = { ...fieldStyle, padding: '6px 8px', fontSize: 12 };

// A week of meals for one client. Build each day from the coach's own recipes
// or by typing items in; the client sees it on their Coach tab and can log a
// meal in one tap. Validated here for friendly errors and again in the
// database, which is the authority.
export default function MealPlanEditor({ trainerId, clientData, admin }) {
  const { supported, plan, loading, save, remove } = admin;
  const [name, setName] = useState('Meal plan');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [days, setDays] = useState({});
  const [activeDay, setActiveDay] = useState('mon');
  const [copyTo, setCopyTo] = useState([]);
  const [showGrocery, setShowGrocery] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(plan?.name || 'Meal plan');
    setNotes(plan?.notes || '');
    setIsActive(plan ? plan.is_active : true);
    setDays(withKeys(plan?.days));
    setError(null);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    if (!trainerId) return undefined;
    getSavedMeals(trainerId).then((rows) => { if (!cancelled) setRecipes(rows); }).catch((err) => console.error('Failed to load recipes:', err));
    return () => { cancelled = true; };
  }, [trainerId]);

  const grocery = useMemo(() => groceryList(cleanDays(days)), [days]);

  if (!supported && !loading) {
    return (
      <Card>
        <SectionLabel icon="ti-calendar-week">Meal plan</SectionLabel>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Meal plans need the latest database update, which hasn't been applied yet.</p>
      </Card>
    );
  }

  const edit = (fn) => { setDays(fn); setSaved(false); };
  const day = days[activeDay] || {};
  const setMeal = (mealKey, fn) => edit((d) => ({ ...d, [activeDay]: { ...(d[activeDay] || {}), [mealKey]: fn((d[activeDay] || {})[mealKey] || []) } }));
  const updateItem = (mealKey, k, patch) => setMeal(mealKey, (items) => items.map((it) => (it._k === k ? { ...it, ...patch } : it)));

  const handleSave = async () => {
    const cleaned = cleanDays(days);
    const problem = validateMealPlan(cleaned) || (name.trim() ? null : 'Give the plan a name.');
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      await save({ name: name.trim(), notes: notes.trim(), days: cleaned, isActive });
      setSaved(true);
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove ${clientData.name || 'this client'}'s meal plan? This can't be undone.`)) return;
    setError(null);
    try { await remove(plan.id); } catch (err) { setError(err.message || "Couldn't remove it — try again."); }
  };

  const copyGrocery = async () => {
    try { await navigator.clipboard.writeText(groceryText(grocery)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const total = dayTotals(day);

  return (
    <Card>
      <SectionLabel icon="ti-calendar-week">Meal plan</SectionLabel>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '-6px 0 16px', lineHeight: 1.5 }}>
        {clientData.name || 'Your client'} sees this on their Coach tab and can log a meal in one tap.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="plan-name" style={labelStyle}>Plan name</label>
          <input id="plan-name" value={name} maxLength={LIMITS.planName} onChange={(e) => { setName(e.target.value); setSaved(false); }} style={fieldStyle} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'flex-end', paddingBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => { setIsActive(e.target.checked); setSaved(false); }} />
          Send to {clientData.name || 'client'}
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="plan-notes" style={labelStyle}>Notes for the client (optional)</label>
        <textarea id="plan-notes" value={notes} maxLength={LIMITS.notes} rows={2} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} style={{ ...fieldStyle, resize: 'vertical' }} />
      </div>

      <div role="tablist" aria-label="Day of the week" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
        {DAYS.map((d) => {
          const has = (MEALS.some((m) => (days[d.key]?.[m.key] || []).length > 0));
          return (
            <button key={d.key} role="tab" aria-selected={activeDay === d.key} onClick={() => { setActiveDay(d.key); setCopyTo([]); }} className="btn-press"
              style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: activeDay === d.key ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${activeDay === d.key ? 'var(--accent-dark)' : 'var(--border-strong)'}`, color: activeDay === d.key ? 'var(--accent)' : 'var(--text-muted)' }}>
              {d.short}{has ? ' •' : ''}
            </button>
          );
        })}
      </div>

      {MEALS.map((meal) => {
        const items = day[meal.key] || [];
        return (
          <div key={meal.key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{meal.label}</span>
              {items.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mealTotals(items).calories} kcal</span>}
            </div>
            {items.map((it, i) => (
              <div key={it._k} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <input aria-label={`${meal.label} item ${i + 1} name`} placeholder="Food" value={it.name} maxLength={LIMITS.name} onChange={(e) => updateItem(meal.key, it._k, { name: e.target.value })} style={{ ...small, flex: '2 1 130px', minWidth: 0 }} />
                <input aria-label={`${meal.label} item ${i + 1} portion`} placeholder="Portion" value={it.label ?? ''} maxLength={LIMITS.label} onChange={(e) => updateItem(meal.key, it._k, { label: e.target.value })} style={{ ...small, flex: '1 1 80px', minWidth: 0 }} />
                {[['calories', 'kcal'], ['protein_g', 'P'], ['carbs_g', 'C'], ['fat_g', 'F']].map(([f, label]) => (
                  <input key={f} type="number" min="0" inputMode="decimal" aria-label={`${meal.label} item ${i + 1} ${label === 'kcal' ? 'calories' : label === 'P' ? 'protein' : label === 'C' ? 'carbs' : 'fat'}`} placeholder={label} value={it[f] ?? ''} onChange={(e) => updateItem(meal.key, it._k, { [f]: e.target.value })} style={{ ...small, width: 58, flex: '0 0 auto' }} />
                ))}
                <button onClick={() => setMeal(meal.key, (xs) => xs.filter((x) => x._k !== it._k))} aria-label={`Remove ${meal.label} item ${i + 1}`} className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 15, padding: 4 }}><i className="ti ti-trash" /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setMeal(meal.key, (xs) => [...xs, withKey(newItem())])} disabled={items.length >= LIMITS.items} className="btn-press" style={{ ...ghost, opacity: items.length >= LIMITS.items ? 0.5 : 1 }}>+ Add item</button>
              {recipes.length > 0 && (
                <select aria-label={`Add a recipe to ${meal.label}`} value="" onChange={(e) => { const r = recipes.find((x) => x.id === e.target.value); if (r) setMeal(meal.key, (xs) => [...xs, withKey(recipeToItem(r))]); }} style={{ ...ghost, cursor: 'pointer' }}>
                  <option value="">+ From my recipes…</option>
                  {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span>{DAYS.find((d) => d.key === activeDay).label} total</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{total.calories} kcal · P {total.protein_g}g · C {total.carbs_g}g · F {total.fat_g}g</span>
      </div>

      <details style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Copy {DAYS.find((d) => d.key === activeDay).short} to other days…</summary>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          {DAYS.filter((d) => d.key !== activeDay).map((d) => (
            <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={copyTo.includes(d.key)} onChange={(e) => setCopyTo((cur) => (e.target.checked ? [...cur, d.key] : cur.filter((k) => k !== d.key)))} /> {d.short}
            </label>
          ))}
          <button onClick={() => { edit((cur) => copyDay(cur, activeDay, copyTo)); setCopyTo([]); }} disabled={copyTo.length === 0} className="btn-press" style={{ ...ghost, opacity: copyTo.length === 0 ? 0.5 : 1 }}>Copy</button>
          <button onClick={() => edit((cur) => { const next = { ...cur }; delete next[activeDay]; return next; })} className="btn-press" style={{ ...ghost, border: 'none', color: 'var(--text-muted)' }}>Clear {DAYS.find((d) => d.key === activeDay).short}</button>
        </div>
      </details>

      <div style={{ marginBottom: 14 }}>
        <button onClick={() => setShowGrocery((v) => !v)} aria-expanded={showGrocery} className="btn-press" style={ghost}>Grocery list ({grocery.length})</button>
        {showGrocery && (
          <div style={{ marginTop: 10 }}>
            {grocery.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Add some meals first.</p> : (
              <>
                <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
                  {grocery.map((g) => <li key={g.key}>{g.name}{g.label ? ` (${g.label})` : ''}{g.count > 1 ? ` ×${g.count}` : ''}</li>)}
                </ul>
                <button onClick={copyGrocery} className="btn-press" style={ghost}>{copied ? 'Copied' : 'Copy list'}</button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={handleSave} disabled={saving} className="btn-press" style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {saving ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
        </button>
        {plan && <button onClick={handleRemove} className="btn-press" style={{ ...ghost, border: 'none', color: 'var(--text-muted)' }}>Remove plan</button>}
        {saved && <span role="status" style={{ color: 'var(--accent)', fontSize: 12 }}>Saved</span>}
        {!planHasItems(days) && <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>Empty so far</span>}
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
    </Card>
  );
}
