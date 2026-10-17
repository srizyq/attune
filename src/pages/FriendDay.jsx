import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useSavedMeals } from '../hooks/useSavedMeals';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Toast from '../components/Toast';
import Avatar from '../components/Avatar';
import LogItemRow from '../components/LogItemRow';
import DaySummary from '../components/friends/DaySummary';
import { MEAL_LABELS } from '../components/coach/constants';
import { getFriendDay, getFriendRecipes, removeFriend, friendlyFriendsError } from '../lib/friends';
import { sumFoodItems, scaleFood, formatAmountUnit } from '../lib/foodMath';
import { round1 } from '../lib/format';
import { todayLocalDate } from '../lib/patterns';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const card = { background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)' };
const sectionLabel = { fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '22px 2px 10px' };

function SharedRecipe({ recipe, onSave, saving }) {
  const [open, setOpen] = useState(false);
  const servings = Number(recipe.servings) || 1;
  const perServing = useMemo(() => scaleFood(sumFoodItems(recipe.items), 1 / servings), [recipe.items, servings]);
  return (
    <div style={{ ...card, marginBottom: 10, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{recipe.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {Math.round(perServing.cal)} kcal · P {round1(perServing.protein)}g · C {round1(perServing.carbs)}g · F {round1(perServing.fat)}g per serving
          </span>
        </span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border-default)', padding: '12px 16px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Makes {servings} serving{servings === 1 ? '' : 's'}</div>
          {recipe.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflowWrap: 'anywhere' }}>
                {it.loggedAmount != null && it.loggedUnit ? `${formatAmountUnit(it.loggedAmount, it.loggedUnit)} ` : ''}{it.name}
              </span>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(it.cal || 0)} kcal</span>
            </div>
          ))}
          <button type="button" onClick={() => onSave(recipe)} disabled={saving} style={{ marginTop: 12, width: '100%', minHeight: 44, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save to my recipes'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function FriendDay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const savedMeals = useSavedMeals();
  const today = useMemo(() => todayLocalDate(), []);
  const [day, setDay] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [d, r] = await Promise.all([getFriendDay(id, today), getFriendRecipes(id)]);
      setDay(d);
      setRecipes(r);
      setStatus('ready');
    } catch (err) {
      console.error('Failed to load friend:', err);
      setError(err);
      setStatus('error');
    }
  }, [id, today]);

  useEffect(() => { load(); }, [load]);

  const meals = useMemo(() => {
    const by = Object.fromEntries(MEALS.map((m) => [m, []]));
    for (const item of day?.items || []) (by[item.meal] || by.snacks).push(item);
    return by;
  }, [day]);
  const totals = useMemo(() => {
    const all = day?.items || [];
    return { calories: all.reduce((s, i) => s + i.cal, 0), protein: all.reduce((s, i) => s + i.protein, 0), carbs: all.reduce((s, i) => s + i.carbs, 0), fat: all.reduce((s, i) => s + i.fat, 0) };
  }, [day]);

  async function saveRecipe(recipe) {
    setSavingId(recipe.id);
    try {
      await savedMeals.create(recipe.name, recipe.items, recipe.servings);
      showToast(`${recipe.name} saved to your recipes`);
    } catch (err) {
      console.error('Failed to save recipe:', err);
      showToast('Couldn\'t save that recipe. Try again.', true);
    } finally {
      setSavingId(null);
    }
  }

  async function remove() {
    try {
      await removeFriend(id);
      navigate('/friends', { replace: true });
    } catch (err) {
      setConfirmRemove(false);
      showToast(friendlyFriendsError(err), true);
    }
  }

  const name = day?.name || 'Friend';
  let body;
  if (status === 'loading') {
    body = <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>;
  } else if (status === 'error') {
    body = (
      <div role="alert" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {friendlyFriendsError(error)}{' '}
        <button type="button" onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: 0 }}>Try again</button>
      </div>
    );
  } else {
    body = (
      <>
        <div style={{ ...card, padding: '18px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Avatar name={name} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 17, overflowWrap: 'anywhere' }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Today</div>
            </div>
          </div>
          {day.hidden ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>{name} isn't sharing their day today.</p>
          ) : (
            <DaySummary totals={totals} targets={day.targets} />
          )}
        </div>

        {!day.hidden && (
          <>
            <div data-testid="friend-log-label" style={sectionLabel}>Daily log</div>
            {day.items.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 2px' }}>{name} hasn't logged anything yet today.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MEALS.filter((m) => meals[m].length > 0).map((mealKey) => {
                  const items = meals[mealKey];
                  return (
                    <div key={mealKey} style={{ ...card, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{MEAL_LABELS[mealKey]}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                            P {round1(items.reduce((s, i) => s + i.protein, 0))}g · C {round1(items.reduce((s, i) => s + i.carbs, 0))}g · F {round1(items.reduce((s, i) => s + i.fat, 0))}g
                          </div>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{Math.round(items.reduce((s, i) => s + i.cal, 0))} kcal</span>
                      </div>
                      <div style={{ borderTop: '1px solid var(--border-default)' }}>
                        {items.map((item) => (
                          <LogItemRow key={item.id} item={item} readOnly isExpanded={expandedId === item.id} onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div style={sectionLabel}>Recipes {name} shared</div>
        {recipes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 2px' }}>{name} hasn't shared any recipes yet.</p>
        ) : (
          recipes.map((r) => <SharedRecipe key={r.id} recipe={r} saving={savingId === r.id} onSave={saveRecipe} />)
        )}

        <div style={{ marginTop: 28, textAlign: 'center' }}>
          {confirmRemove ? (
            <div role="alertdialog" aria-label="Remove friend" style={{ ...card, padding: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>Remove {name}? You'll stop seeing each other's days.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, minHeight: 44, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 14, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={remove} style={{ flex: 1, minHeight: 44, background: 'var(--danger)', border: 'none', borderRadius: 14, color: '#fff', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} style={{ minHeight: 44, background: 'none', border: 'none', color: 'var(--danger)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: '0 12px' }}>Remove friend</button>
          )}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="friends" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title={status === 'ready' ? name : 'Friend'} onBack={() => navigate('/friends')} backLabel="Back to Friends" />
        <div className="page-pad" style={{ maxWidth: 700 }}>{body}</div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
