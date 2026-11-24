import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { hasProAccess } from '../lib/proAccess';
import { todayLocalDate } from '../lib/patterns';
import { targetsForDate } from '../lib/dayTargets';
import { targetsFor } from '../lib/nutrientTargets';
import { scaleFood, formatAmountUnit, initialEditState, editUnitsFor, editServings, editAmountFor, editStep, gramsPerServing } from '../lib/foodMath';
import { dateToHHMM, timeStringToDate } from '../lib/mealTime';
import RecalculatePhotoModal from '../components/RecalculatePhotoModal';
import { FoodDetailsPage } from '../components/FoodDetails';
import { SummaryCard, Segmented, AmountStepper, NutritionCard } from '../components/entry/EntryParts';
import { ScanPage, ScanCard, Eyebrow, PrimaryButton, GhostButton } from '../components/scan/ScanKit';

const MEAL_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
];

const MULTIPLIERS = [0.5, 1, 1.5, 2];
const ctrlStyle = { width: '100%', boxSizing: 'border-box', minHeight: 44, background: 'var(--chip-bg)', border: '1px solid transparent', borderRadius: 14, padding: '0 12px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' };

// Matches buildDayTimeline's own item.loggedAt || item.createdAt fallback
// (lib/mealTime.js) — a legacy/free-tier item with no real loggedAt still
// needs a sensible time seed, and it must agree with whichever hour the
// timeline is actually showing it under, not default to "right now" and
// silently disagree with the visible bucket.
function effectiveLoggedAt(item) {
  return new Date(item.loggedAt || item.createdAt || Date.now());
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
  // Back to wherever you came from; opened from a link (nothing behind it in the app), it goes to the log.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/log', { replace: true, state: { date } }));

  if (!item) {
    return (
      <ScanPage title="Entry editor" onBack={back} backLabel="Back" testId="edit-log-item">
        <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>{loading ? 'Loading…' : "That entry isn't there any more."}</p>
      </ScanPage>
    );
  }
  return (
    <EditForm
      key={item.id} item={item} date={date} profile={profile} isPremium={isPremium} slots={slots} updateFood={updateFood} back={back}
      onDelete={async () => { await deleteFood(item.id); back(); }}
    />
  );
}

function EditForm({ item, date, profile, isPremium, slots, updateFood, back, onDelete }) {
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { closing: detailsClosing, close: closeDetails } = useClosingTransition(() => setDetailsOpen(false));
  useEffect(() => { if (!menuOpen) return undefined; const close = () => setMenuOpen(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, [menuOpen]);

  const availableUnits = editUnitsFor(item);
  const servingGrams = item.servingGrams || 100;
  const servings = editServings(item, amount, unit);
  const gramsEquivalent = Math.round(servings * servingGrams);
  const preview = scaleFood(item, servings || 0);
  const macroTargets = targetsForDate(profile, date);
  const microTargets = targetsFor(profile);
  const mealLabel = MEAL_OPTIONS.find((m) => m.value === meal)?.label || 'Meal';
  const portion = hasKnownWeight ? formatAmountUnit(Number(amount) || 0, unit) : `${preview.cal} kcal`;
  const subtitle = [item.brand, portion].filter(Boolean).join(' · ');

  // Switching unit keeps how much food it is (1 serving -> 170g), instead of
  // leaving "1" behind and quietly turning it into 1g.
  function changeUnit(next) {
    if (next === unit) return;
    const converted = servings > 0 ? editAmountFor(item, servings, next) : 0;
    setUnit(next);
    if (converted > 0) setAmount(String(converted));
  }
  const setMultiplier = (m) => setAmount(String(editAmountFor(item, m, unit)));
  const unitLabel = !hasKnownWeight ? 'kcal' : unit === 'serving' ? (Number(amount) === 1 ? 'serving' : 'servings') : unit;
  const baseHint = hasKnownWeight && gramsPerServing(item) ? `1 serving = ${Math.round(gramsPerServing(item))}g` : null;

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
    <>
      <ScanPage
        title="Entry editor" onBack={back} backLabel="Back" testId="edit-log-item"
        headerRight={(
          <div style={{ position: 'relative' }}>
            <button type="button" aria-label="More" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <i className="ti ti-dots" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 50, minWidth: 210, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', padding: 6, zIndex: 5 }}>
                <MenuItem icon="ti-list-details" onClick={() => { setMenuOpen(false); setDetailsOpen(true); }}>See all nutrients</MenuItem>
                {item.source === 'photo' && <MenuItem icon="ti-camera" onClick={() => { setMenuOpen(false); setRecalcOpen(true); }}>Recalculate with a new photo</MenuItem>}
                <MenuItem icon="ti-trash" danger onClick={onDelete}>Remove item</MenuItem>
              </div>
            )}
          </div>
        )}
        footer={(
          <>
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 8px', textAlign: 'center' }}>{error}</p>}
            <PrimaryButton onClick={handleSave} disabled={saving || !servings}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {saving ? 'Saving…' : isPremium ? 'Save changes' : `Save to ${mealLabel} Log`}
              </span>
            </PrimaryButton>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
              <GhostButton onClick={onDelete} style={{ color: 'var(--danger)' }}>Remove item</GhostButton>
            </div>
          </>
        )}
      >
        <div style={{ margin: '4px 4px 16px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, margin: '0 0 4px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', overflowWrap: 'anywhere' }} data-testid="entry-subtitle">{subtitle}</div>
        </div>

        <SummaryCard food={preview} targets={macroTargets} />

        {item.ingredients && (
          <ScanCard style={{ padding: '14px 16px 6px' }}>
            <Eyebrow style={{ marginBottom: 4 }}>Ingredients (as scanned)</Eyebrow>
            {item.ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < item.ingredients.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{ing.name}{ing.grams ? <span style={{ color: 'var(--text-muted)' }}> · {Math.round(ing.grams)}g</span> : null}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(ing.cal || 0)} cal</span>
              </div>
            ))}
          </ScanCard>
        )}

        <ScanCard>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <Eyebrow>Portion size</Eyebrow>
            {baseHint && <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{baseHint}</span>}
          </div>
          <AmountStepper amount={amount} onChange={setAmount} step={editStep(unit, hasKnownWeight)} unitLabel={unitLabel} />
          <div style={{ marginTop: 12 }}>
            <Segmented
              size="sm" label="Quick amount" testId="entry-multipliers" value={MULTIPLIERS.find((m) => Math.abs(servings - m) < 0.005) ?? null}
              options={MULTIPLIERS.map((m) => ({ id: m, label: `${m.toFixed(1)}×` }))} onChange={setMultiplier}
            />
          </div>
          {hasKnownWeight ? (
            <div style={{ marginTop: 10 }}>
              <Segmented label="Unit" testId="entry-units" equal={false} value={unit} options={availableUnits.map((u) => ({ id: u.id, label: u.label }))} onChange={changeUnit} />
            </div>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 2px 0' }}>No serving weight, so calories and macros scale together.</p>
          )}
        </ScanCard>

        <ScanCard>
          {isPremium ? (
            <>
              <Eyebrow style={{ marginBottom: 10 }}>Logged at</Eyebrow>
              <input type="time" aria-label="Logged at" style={ctrlStyle} value={time} onChange={(e) => setTime(e.target.value)} />
              {slots && (
                <>
                  <Eyebrow style={{ margin: '14px 0 10px' }}>Slot</Eyebrow>
                  <select id="log-item-slot" aria-label="Slot" style={{ ...ctrlStyle, cursor: 'pointer' }} value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                    <option value="">Uncategorised</option>
                    {slots.map((sl) => <option key={sl.id} value={sl.id}>{sl.label}</option>)}
                  </select>
                </>
              )}
            </>
          ) : (
            <>
              <Eyebrow style={{ marginBottom: 10 }}>Target meal</Eyebrow>
              <Segmented label="Meal" testId="entry-meals" value={meal} options={MEAL_OPTIONS.map((m) => ({ id: m.value, label: m.label }))} onChange={setMeal} />
            </>
          )}
        </ScanCard>

        <NutritionCard food={preview} targets={microTargets} onSeeAll={() => setDetailsOpen(true)} />
      </ScanPage>
      {detailsOpen && <FoodDetailsPage food={preview} onClose={closeDetails} closing={detailsClosing} />}
      {recalcOpen && (
        <RecalculatePhotoModal
          itemName={item.name}
          onClose={() => setRecalcOpen(false)}
          onApply={handleRecalculate}
        />
      )}
    </>
  );
}

function MenuItem({ icon, danger, onClick, children }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: 'none', border: 'none', borderRadius: 12, color: danger ? 'var(--danger)' : 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <i className={`ti ${icon}`} aria-hidden="true" /> {children}
    </button>
  );
}
