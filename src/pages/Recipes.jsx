import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useSavedMeals } from '../hooks/useSavedMeals';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { scaleFood, sumFoodItems, formatAmountUnit } from '../lib/foodMath';
import { todayLocalDate } from '../lib/patterns';
import { mealFromDate, currentTimeHHMM, timeStringToDate, formatTimeFromDate } from '../lib/mealTime';
import AppNav from '../components/AppNav';
import Toast from '../components/Toast';
import { Card, SectionLabel } from '../components/settings/primitives';
import PageHeader from '../components/PageHeader';

// Mirrors FoodSearch.jsx's own local MEALS list — not shared/exported
// from there, and small enough that duplicating it here is simpler than
// pulling it into its own module for one extra caller.
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const inputStyle = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7,
  padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

// One recipe row — collapsed shows the headline numbers, expanded reveals
// the real ingredient list (with quantities, not just macros) plus the
// actual "log N servings" control, matching the amount+unit interaction
// every other food in the app already uses (see FoodSearch's AddControls)
// rather than inventing a new one.
function RecipeCard({ recipe, isExpanded, onToggle, onEdit, onDelete, onLog, logByTime, defaultMeal, defaultTime }) {
  const items = useMemo(() => recipe.items || [], [recipe.items]);
  const servings = Number(recipe.servings) || 1;
  const totals = useMemo(() => sumFoodItems(items), [items]);
  const perServing = useMemo(() => scaleFood(totals, 1 / servings), [totals, servings]);

  const [servingsToLog, setServingsToLog] = useState('1');
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [logging, setLogging] = useState(false);

  const scaledForLog = scaleFood(perServing, Number(servingsToLog) || 0);

  async function handleLog() {
    const n = Number(servingsToLog);
    if (!n || n <= 0 || logging) return;
    setLogging(true);
    try {
      await onLog(recipe, n, meal, time);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', fontFamily: 'inherit' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{recipe.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {items.length} ingredient{items.length !== 1 ? 's' : ''} · makes {servings} serving{servings !== 1 ? 's' : ''} · {Math.round(perServing.cal)} kcal/serving
          </div>
        </div>
        <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: 'var(--text-hint)', fontSize: 16, flexShrink: 0 }} />
      </button>

      {isExpanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14, marginBottom: 14 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {it.loggedAmount != null && it.loggedUnit ? `${formatAmountUnit(it.loggedAmount, it.loggedUnit)} ` : ''}
                  {it.name}
                </span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(it.cal)} kcal</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{Math.round(perServing.cal)}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>kcal</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{perServing.protein}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Protein</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--water-blue)' }}>{perServing.carbs}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Carbs</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ai-purple)' }}>{perServing.fat}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fat</div></div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-hint)', margin: '-10px 0 14px', textAlign: 'center' }}>per serving — {Math.round(totals.cal)} kcal total for the whole recipe</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="number" min="0" step="0.5" value={servingsToLog} onChange={e => setServingsToLog(e.target.value)}
              style={{ ...inputStyle, width: 70 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>serving{Number(servingsToLog) === 1 ? '' : 's'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>≈ {Math.round(scaledForLog.cal)} kcal</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {logByTime ? (
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            ) : (
              <select value={meal} onChange={e => setMeal(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                {MEALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <button
              onClick={handleLog}
              disabled={logging || !Number(servingsToLog)}
              style={{ flex: 1, background: logging || !Number(servingsToLog) ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 7, padding: '9px', fontSize: 13, fontWeight: 600, color: logging || !Number(servingsToLog) ? 'var(--text-muted)' : '#0f0f0f', cursor: logging || !Number(servingsToLog) ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {logging ? 'Adding…' : 'Log'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onEdit(recipe)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <i className="ti ti-edit" style={{ marginRight: 4 }} />Edit
            </button>
            <button onClick={() => onDelete(recipe)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px', fontSize: 12, color: 'var(--danger)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <i className="ti ti-trash" style={{ marginRight: 4 }} />Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Recipes() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const savedMeals = useSavedMeals();
  const today = todayLocalDate();
  const { addFood, refetch: refetchLogs } = useFoodLogs(today);

  const isPremium = !!profile?.is_premium;
  const dailyLogView = profile?.daily_log_view || 'hourly';
  const logByTime = isPremium && dailyLogView === 'hourly';
  const defaultMeal = useMemo(() => {
    const m = mealFromDate(new Date());
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, []);

  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);

  function showToast(message, isError = false) {
    setToast(message);
    setToastError(isError);
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return savedMeals.rows;
    return savedMeals.rows.filter(r => r.name.toLowerCase().includes(q));
  }, [savedMeals.rows, query]);

  async function handleLog(recipe, servingsToLog, meal, time) {
    try {
      const totals = sumFoodItems(recipe.items || []);
      const perServing = scaleFood(totals, 1 / (Number(recipe.servings) || 1));
      const scaled = scaleFood(perServing, servingsToLog);
      const loggedAt = logByTime ? timeStringToDate(time, new Date(today + 'T00:00:00')) : null;
      await addFood(
        { ...scaled, name: recipe.name, servingLabel: `${servingsToLog} serving${servingsToLog === 1 ? '' : 's'}`, source: 'recipe' },
        logByTime ? null : meal,
        loggedAt
      );
      refetchLogs();
      showToast(`${recipe.name} added${logByTime ? ` at ${formatTimeFromDate(loggedAt)}` : ` to ${meal}`}`);
    } catch (err) {
      console.error('Failed to log recipe:', err);
      showToast(`Couldn't add ${recipe.name} — try again`, true);
    }
  }

  async function handleDelete(recipe) {
    try {
      await savedMeals.remove(recipe.id);
      showToast(`${recipe.name} deleted`);
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      showToast(`Couldn't delete ${recipe.name} — try again`, true);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="food" />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader
          title="Recipes"
          onBack={goBack}
          backLabel="Back"
          right={
            <button
            onClick={() => navigate('/food', { state: { openMealBuilder: true } })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#0f0f0f', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            <i className="ti ti-plus" /> New recipe
          </button>
          }
        />

        <div className="page-pad" style={{ maxWidth: 700 }}>
          {savedMeals.rows.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-hint)', fontSize: 16 }} />
              <input
                value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recipes…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px 11px 38px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
          )}

          {savedMeals.loading ? null : savedMeals.rows.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 32 }}>
              <i className="ti ti-tools-kitchen-2" style={{ fontSize: 28, color: 'var(--text-hint)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
                No recipes yet. Build one from foods you cook often — add ingredients, say how many servings it makes, and log it in one tap from now on.
              </p>
            </Card>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No recipes match "{query}"</p>
          ) : (
            <>
              <SectionLabel>{filtered.length} recipe{filtered.length !== 1 ? 's' : ''}</SectionLabel>
              {filtered.map(recipe => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isExpanded={expandedId === recipe.id}
                  onToggle={() => setExpandedId(prev => (prev === recipe.id ? null : recipe.id))}
                  onEdit={(r) => navigate('/food', { state: { editMealBuilder: r.id } })}
                  onDelete={handleDelete}
                  onLog={handleLog}
                  logByTime={logByTime}
                  defaultMeal={defaultMeal}
                  defaultTime={currentTimeHHMM()}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
