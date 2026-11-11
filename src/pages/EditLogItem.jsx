import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { hasProAccess } from '../lib/proAccess';
import { todayLocalDate } from '../lib/patterns';
import { round1 } from '../lib/format';
import { scaleFood, formatAmountUnit, initialEditState, editUnitsFor, editServings } from '../lib/foodMath';
import { dateToHHMM, timeStringToDate } from '../lib/mealTime';
import RecalculatePhotoModal from '../components/RecalculatePhotoModal';
import SegmentedControl from '../components/SegmentedControl';
import SeeDetails from '../components/FoodDetails';
import FormRow from '../components/FormRow';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';

const MEAL_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
];

const C = {
  green: 'var(--accent)', protein: 'var(--macro-protein)', blue: 'var(--macro-carbs)', purple: 'var(--macro-fat)',
};

const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '10px 12px', minHeight: 44, color: 'var(--text-primary)', fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };


// Matches buildDayTimeline's own item.loggedAt || item.createdAt fallback
// (lib/mealTime.js) — a legacy/free-tier item with no real loggedAt still
// needs a sensible time seed, and it must agree with whichever hour the
// timeline is actually showing it under, not default to "right now" and
// silently disagree with the visible bucket.
function effectiveLoggedAt(item) {
  return new Date(item.loggedAt || item.createdAt || Date.now());
}

// Plain text macro readout — matches the style used everywhere else in the
// app (e.g. FoodCard's add-food preview) instead of a bordered box.
function MacroReadout({ value, unit, label, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{value}{unit}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// Edit a logged food (a page, /log/item/:id?date=): how much of it you had,
// plus — since when you happened to be logging it isn't necessarily when you
// ate it — which meal it belongs to, or (Slots view) what time and slot,
// instead of having to delete and re-add. Macros are never edited directly;
// every macro/micronutrient is scaled proportionally from the logged amount so
// the numbers stay internally consistent.
export default function EditLogItem() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { profile } = useProfile();
  const requested = params.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : todayLocalDate();
  const { meals, daySlots, loading, updateFood, deleteFood } = useFoodLogs(date);
  const item = Object.values(meals).flat().find((i) => i.id === id) || null;
  const isPremium = hasProAccess(profile) && profile?.daily_log_view === 'slots';
  const slots = isPremium ? daySlots : null;
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/log', { state: { date } }));

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="log" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title={item?.name || 'Edit food'} subtitle={item?.brand || undefined} onBack={back} backLabel="Back" />
        <div className="page-pad">
          {!item ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>{loading ? 'Loading…' : "That entry isn't there any more."}</p>
          ) : (
            <EditForm key={item.id} item={item} isPremium={isPremium} slots={slots} updateFood={updateFood} back={back} onDelete={async () => { await deleteFood(item.id); back(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function EditForm({ item, isPremium, slots, updateFood, back, onDelete }) {
  // Older items logged before serving_grams was tracked have no real
  // weight on record. Silently guessing 100g there would look precise
  // without being true — so weight-based units are only offered when we
  // actually know what this item weighs.
  const hasKnownWeight = !!item.servingGrams;

  const [amount, setAmount] = useState(() => initialEditState(item).amount);
  const [unit, setUnit] = useState(() => initialEditState(item).unit);
  const [meal, setMeal] = useState(item.meal);
  const [time, setTime] = useState(() => dateToHHMM(effectiveLoggedAt(item)));
  // Slots mode: which slot this food sits in ('' = Uncategorised).
  const [slotId, setSlotId] = useState(item.slotId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [recalcOpen, setRecalcOpen] = useState(false);

  const availableUnits = editUnitsFor(item);
  const servingGrams = item.servingGrams || 100;
  const servings = editServings(item, amount, unit);
  const gramsEquivalent = Math.round(servings * servingGrams);
  const preview = scaleFood(item, servings || 0);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Only persist a servingGrams value when the item actually had one —
      // otherwise a "2 servings" edit on a legacy item with no real weight
      // would silently fabricate one from the 100g fallback and make it
      // look gram-accurate on the next edit. loggedAmount/loggedUnit follow
      // the same known-weight gate and the same reasoning: without them,
      // Recent/Frequent's row subtitle and quick-re-add prefill (both read
      // straight off logged_amount/logged_unit, see recentRowMeta in
      // FoodSearch.jsx) kept showing whatever amount this item was
      // *originally* logged with even after an edit changed it. Left
      // unset (not nulled) when there's no known weight, since amount here
      // is a calorie-ratio typed against the 'serving' unit, not a real
      // portion figure worth persisting as one.
      //
      // meal/loggedAt are set explicitly here rather than left to
      // `...preview`'s spread — scaleFood() spreads every field of `item`
      // through unchanged, including the *original* loggedAt as a raw ISO
      // string (not a Date), which would otherwise silently leak into the
      // free-tier save path and crash db.js's toISOString() call.
      await updateFood(item.id, {
        ...preview,
        servingGrams: hasKnownWeight ? gramsEquivalent : null,
        ...(hasKnownWeight ? { loggedAmount: Number(amount) || null, loggedUnit: unit } : {}),
        meal: isPremium ? item.meal : meal,
        loggedAt: isPremium ? timeStringToDate(time, effectiveLoggedAt(item)) : (item.loggedAt ? new Date(item.loggedAt) : null),
        ...(slots ? { slotId: slotId || null } : {}),
      });
      back();
    } catch (err) {
      console.error('Failed to save food log edits:', err);
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  // A fresh AI photo estimate replaces this item's name/nutrition
  // directly — servingGrams resets to null since a new photo estimate is
  // no more a real measured weight than the original one was (see
  // PhotoScanModal, which never sets it either). loggedAmount/loggedUnit
  // reset alongside it for the same reason — a stale "250g" surviving on
  // a row that no longer has a known weight would be actively wrong, not
  // just outdated, the next time Recent/Frequent reads it. Meal/time
  // follow the same save-payload shape as handleSave so this doesn't
  // silently discard whatever the user already changed in the open edit
  // form.
  async function handleRecalculate(result) {
    await updateFood(item.id, {
      ...item,
      name: result.name,
      cal: result.cal,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      servingGrams: null,
      loggedAmount: null,
      loggedUnit: null,
      meal: isPremium ? item.meal : meal,
      loggedAt: isPremium ? timeStringToDate(time, effectiveLoggedAt(item)) : (item.loggedAt ? new Date(item.loggedAt) : null),
    });
  }
  return (
    <div style={{ maxWidth: 520 }}>
            {item.ingredients && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Ingredients (as scanned)</label>
                <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '0 12px', background: 'var(--bg-primary)' }}>
                  {item.ingredients.map((ing, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < item.ingredients.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{ing.name}{ing.grams ? <span style={{ color: 'var(--text-muted)' }}> · {Math.round(ing.grams)}g</span> : null}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(ing.cal || 0)} cal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="edit-amount" style={labelStyle}>{hasKnownWeight
                    ? `Amount (currently ${item.loggedUnit && item.loggedAmount != null ? formatAmountUnit(item.loggedAmount, item.loggedUnit) : `${item.servingGrams}g`})`
                    : `Calories (currently ${item.cal})`}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input id="edit-amount" aria-label="Amount" style={{ ...fieldStyle, width: 90 }} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
                    {hasKnownWeight && (
                      <SegmentedControl options={availableUnits} value={unit} onChange={setUnit} fill={false} />
                    )}
                  </div>
                  {!hasKnownWeight && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No serving weight, so calories and macros scale together.</div>}
                  {item.source === 'photo' && (
                    <button
                      type="button"
                      onClick={() => setRecalcOpen(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, padding: '6px 0' }}
                    >
                      <i aria-hidden="true" className="ti ti-camera" style={{ fontSize: 13 }} /> Recalculate with a new photo
                    </button>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  {isPremium ? (
                    <>
                      <label style={labelStyle}>Logged at</label>
                      <input style={{ ...fieldStyle, width: 130 }} type="time" value={time} onChange={e => setTime(e.target.value)} />
                      {slots && (
                        <>
                          <label htmlFor="log-item-slot" style={{ ...labelStyle, marginTop: 12 }}>Slot</label>
                          <select id="log-item-slot" style={{ ...fieldStyle, width: '100%', cursor: 'pointer' }} value={slotId} onChange={e => setSlotId(e.target.value)}>
                            <option value="">Uncategorised</option>
                            {slots.map(sl => <option key={sl.id} value={sl.id}>{sl.label}</option>)}
                          </select>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <label style={labelStyle}>Meal</label>
                      <select style={{ ...fieldStyle, width: 160, cursor: 'pointer' }} value={meal} onChange={e => setMeal(e.target.value)}>
                        {MEAL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border-default)' }}>
                  <MacroReadout value={preview.cal} unit="" label="Calories" color={C.green} />
                  <MacroReadout value={round1(preview.protein)} unit="g" label="Protein" color={C.protein} />
                  <MacroReadout value={round1(preview.carbs)} unit="g" label="Carbs" color={C.blue} />
                  <MacroReadout value={round1(preview.fat)} unit="g" label="Fat" color={C.purple} />
                </div>
                <SeeDetails food={item} style={{ margin: '-6px 0 8px', padding: 0 }} />
                {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
                <FormRow gap={8}>
                  <FormRow.Button icon="ti-device-floppy" primary onClick={handleSave} disabled={saving || !servings}>
                    {saving ? 'Saving…' : 'Save'}
                  </FormRow.Button>
                  <FormRow.Button icon="ti-trash" danger onClick={onDelete}>
                    Delete
                  </FormRow.Button>
                </FormRow>
      {recalcOpen && (
        <RecalculatePhotoModal
          itemName={item.name}
          onClose={() => setRecalcOpen(false)}
          onApply={handleRecalculate}
        />
      )}
    </div>
  );
}
