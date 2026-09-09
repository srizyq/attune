import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { round1 } from '../lib/format';
import { scaleFood, UNITS, amountToServings } from '../lib/foodMath';
import { dateToHHMM, timeStringToDate } from '../lib/mealTime';
import RecalculatePhotoModal from './RecalculatePhotoModal';

// Pixels/second the ticker scrolls at — kept constant so a barely-clipped
// name and a very long one both feel like the same "speed of reading,"
// rather than a fixed duration that'd make long names race by.
const MARQUEE_PX_PER_SEC = 28;
const MARQUEE_MIN_MS = 3200;
const MARQUEE_MAX_MS = 11000;

function marqueeDurationMs(overflowPx) {
  return Math.min(MARQUEE_MAX_MS, Math.max(MARQUEE_MIN_MS, (overflowPx / MARQUEE_PX_PER_SEC) * 1000));
}

const MEAL_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
];

// Shared between Dashboard (theme-converted) and the full /log page (not
// yet converted) — same reasoning as WeekBars in Progress.jsx: uses
// var()s + theme-invariant accent literals so it's correct on Dashboard
// today, at the cost of a contained mismatch on /log until that page's
// own conversion. It's low-impact there since this only renders when a
// row is actually expanded, not on page load.
const C = {
  green: '#8fbc8f', blue: '#6aabcf', purple: '#9f97e8',
};

const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
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

// A logged food row that expands in place to edit how much of it you had,
// plus — since when you happened to be logging it isn't necessarily when
// you ate it — which meal it belongs to (free tier) or what time it's
// logged at (Pro), instead of having to delete and re-add just to move it.
// Shared between the Dashboard's compact meal log and the full /log page
// so both stay in sync instead of drifting into two separate editing UIs.
// Macros are never edited directly; every macro/micronutrient is scaled
// proportionally from the currently-logged amount so the numbers always
// stay internally consistent.
export default function LogItemRow({ item, isExpanded, onToggle, onDelete, onSave, isPremium = false, readOnly = false }) {
  // Older items logged before serving_grams was tracked have no real
  // weight on record. Silently guessing 100g there would look precise
  // without being true — so weight-based units are only offered when we
  // actually know what this item weighs.
  const hasKnownWeight = !!item.servingGrams;
  const nameContainerRef = useRef(null);
  const nameTextRef = useRef(null);
  const [nameOverflow, setNameOverflow] = useState(0);

  // Measures whether the food name actually overflows its row, and if so
  // by how much — only names that don't fit get the scrolling treatment,
  // so a short name never animates just because it happens to share this
  // component. Re-measures on name change (a recalculated/edited item)
  // and on window resize (rotating a phone can turn a fit into an
  // overflow).
  useLayoutEffect(() => {
    function measure() {
      const container = nameContainerRef.current;
      const el = nameTextRef.current;
      if (!container || !el) return;
      setNameOverflow(Math.max(0, el.scrollWidth - container.clientWidth));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [item.name]);

  const [amount, setAmount] = useState(hasKnownWeight ? String(item.servingGrams) : String(item.cal));
  const [unit, setUnit] = useState(hasKnownWeight ? 'g' : 'serving');
  const [meal, setMeal] = useState(item.meal);
  const [time, setTime] = useState(() => dateToHHMM(effectiveLoggedAt(item)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [recalcOpen, setRecalcOpen] = useState(false);

  // Reset whenever this row opens, so stale edits from a previous expand
  // don't linger if you collapse without saving. Deliberately NOT "1
  // serving" for either case — "serving" would mean "whatever's currently
  // saved", which silently redefines itself on every edit (e.g. scaling to
  // 10x and saving makes 10x the new "1 serving" forever after, compounding
  // on the next edit). Known-weight items anchor to grams; items with no
  // real weight on record (e.g. an AI photo estimate, which deliberately
  // never gets a servingGrams — see PhotoScanModal) anchor to their current
  // calories instead, since that's an absolute number, not a self-relative
  // ratio. Either way, the box always shows the item's real current value,
  // so typing the same number back always gives the same result.
  useEffect(() => {
    if (!isExpanded) return;
    setAmount(hasKnownWeight ? String(item.servingGrams) : String(item.cal));
    setUnit(hasKnownWeight ? 'g' : 'serving');
    setMeal(item.meal);
    setTime(dateToHHMM(effectiveLoggedAt(item)));
  }, [isExpanded, item, hasKnownWeight]);

  // "serving" is only offered when there's no real weight to anchor to —
  // otherwise it's the same ambiguous, self-redefining reference point
  // that caused the bug above.
  const availableUnits = hasKnownWeight ? UNITS.filter(u => u.id !== 'serving') : UNITS.filter(u => u.id === 'serving');
  const servingGrams = item.servingGrams || 100;
  // No-known-weight items scale off calories directly (a stable absolute
  // anchor) instead of amountToServings' "amount relative to current
  // serving" math, which is exactly the self-redefining ratio this whole
  // effect is written to avoid.
  const servings = hasKnownWeight
    ? amountToServings(Number(amount) || 0, unit, servingGrams)
    : (Number(amount) || 0) / (item.cal || 1);
  const gramsEquivalent = Math.round(servings * servingGrams);
  const preview = scaleFood(item, servings || 0);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Only persist a servingGrams value when the item actually had one —
      // otherwise a "2 servings" edit on a legacy item with no real weight
      // would silently fabricate one from the 100g fallback and make it
      // look gram-accurate on the next edit.
      //
      // meal/loggedAt are set explicitly here rather than left to
      // `...preview`'s spread — scaleFood() spreads every field of `item`
      // through unchanged, including the *original* loggedAt as a raw ISO
      // string (not a Date), which would otherwise silently leak into the
      // free-tier save path and crash db.js's toISOString() call.
      await onSave({
        ...preview,
        servingGrams: hasKnownWeight ? gramsEquivalent : null,
        meal: isPremium ? item.meal : meal,
        loggedAt: isPremium ? timeStringToDate(time, effectiveLoggedAt(item)) : (item.loggedAt ? new Date(item.loggedAt) : null),
      });
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
  // PhotoScanModal, which never sets it either). Meal/time follow the
  // same save-payload shape as handleSave so this doesn't silently
  // discard whatever the user already changed in the open edit form.
  async function handleRecalculate(result) {
    await onSave({
      ...item,
      name: result.name,
      cal: result.cal,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      servingGrams: null,
      meal: isPremium ? item.meal : meal,
      loggedAt: isPremium ? timeStringToDate(time, effectiveLoggedAt(item)) : (item.loggedAt ? new Date(item.loggedAt) : null),
    });
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border-default)' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 18px', cursor: 'pointer', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div ref={nameContainerRef} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span
              ref={nameTextRef}
              className={nameOverflow > 0 ? 'food-name-marquee' : ''}
              style={{
                color: 'var(--text-secondary)', fontSize: 14,
                ...(nameOverflow > 0
                  ? { '--marquee-distance': `-${nameOverflow}px`, '--marquee-duration': `${marqueeDurationMs(nameOverflow)}ms` }
                  : { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' }),
              }}
            >
              {item.name}
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
            <span style={{ color: C.green, fontWeight: 500 }}>{Math.round(item.cal)} cal</span>
            {' · '}P {round1(item.protein)}g · C {round1(item.carbs)}g · F {round1(item.fat)}g
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: 'var(--border-default)', cursor: 'pointer', fontSize: 15, padding: '2px 4px' }}>×</button>}
          <span style={{ color: 'var(--border-default)', fontSize: 12, display: 'inline-block', transition: 'transform 220ms cubic-bezier(0.77, 0, 0.175, 1)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 220ms cubic-bezier(0.77, 0, 0.175, 1)' }}>
        <div style={{ overflow: 'hidden' }}>
        {/* The collapsed row only ever shows a single clipped/scrolling
            line (see the marquee above) — this is the one place the full
            name, however long, is always shown in full, wrapping onto as
            many lines as it needs since there's no row-height constraint
            here. */}
        {nameOverflow > 0 && (
          <div style={{ padding: '2px 18px 10px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>
            {item.name}
          </div>
        )}
        {readOnly ? (
          <div style={{ padding: '4px 18px 16px', background: 'var(--bg-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
              <MacroReadout value={Math.round(item.cal)} unit="" label="Calories" color={C.green} />
              <MacroReadout value={round1(item.protein)} unit="g" label="Protein" color={C.green} />
              <MacroReadout value={round1(item.carbs)} unit="g" label="Carbs" color={C.blue} />
              <MacroReadout value={round1(item.fat)} unit="g" label="Fat" color={C.purple} />
            </div>
          </div>
        ) : (
        <div style={{ padding: '4px 18px 16px', background: 'var(--bg-subtle)' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{hasKnownWeight ? `Amount (currently ${item.servingGrams}g)` : `Calories (currently ${item.cal})`}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...fieldStyle, width: 90 }} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
              {hasKnownWeight && (
                <div style={{ display: 'flex', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2 }}>
                  {availableUnits.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnit(u.id)}
                      style={{
                        background: unit === u.id ? 'var(--accent-bg)' : 'transparent', border: 'none', borderRadius: 18,
                        padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        color: unit === u.id ? C.green : 'var(--text-muted)', transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!hasKnownWeight && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No serving weight on record for this item — edit calories directly and protein/carbs/fat scale with it. Delete and re-add it via search for gram-accurate editing.</div>}
            <button
              type="button"
              onClick={() => setRecalcOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8, padding: 0 }}
            >
              <i className="ti ti-camera" style={{ fontSize: 13 }} /> Recalculate with a new photo
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            {isPremium ? (
              <>
                <label style={labelStyle}>Logged at</label>
                <input style={{ ...fieldStyle, width: 130 }} type="time" value={time} onChange={e => setTime(e.target.value)} />
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
            <MacroReadout value={round1(preview.protein)} unit="g" label="Protein" color={C.green} />
            <MacroReadout value={round1(preview.carbs)} unit="g" label="Carbs" color={C.blue} />
            <MacroReadout value={round1(preview.fat)} unit="g" label="Fat" color={C.purple} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving || !servings}
              style={{ background: saving || !servings ? 'var(--border-default)' : C.green, border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: saving || !servings ? 'var(--text-muted)' : '#0f0f0f', cursor: saving || !servings ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {error && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>}
          </div>
        </div>
        )}
        </div>
      </div>
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
