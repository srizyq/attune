import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getFoodLogsForDate, copyFoodLogs, getDaySlots, copyDaySlots } from '../lib/db';
import { toggleGroup, rowsToCopy, COPY_DEST_SAME } from '../lib/copyMeals';
import { mapRow } from '../hooks/useFoodLogs';
import { mapSlotRow, formatSlotTime } from '../lib/daySlots';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { todayLocalDate } from '../lib/patterns';
import { withBrand } from '../lib/format';
import DaySelector from './DaySelector';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// Full-width tappable row (44px tall) — the whole line toggles, not just
// the tiny checkbox, which matters on a phone.
const ROW_BUTTON = {
  width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0',
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
};

// on = ticked, some = partly ticked (a meal header with only some items on).
function CheckMark({ state }) {
  const filled = state !== 'off';
  return (
    <span
      aria-hidden="true"
      style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: filled ? 'var(--accent)' : 'transparent',
        border: `1.5px solid ${filled ? 'var(--accent)' : 'var(--border-strong)'}`,
        color: 'var(--accent-contrast)', fontSize: 13, lineHeight: 1,
      }}
    >
      {state === 'on' && <i className="ti ti-check" />}
      {state === 'some' && <i className="ti ti-minus" />}
    </span>
  );
}

// Copies food from another day onto destDate (whatever day DailyLog is
// showing): pick the source day on the week strip (starts on yesterday),
// then choose what to bring over. Everything starts ticked, so copying the
// whole day is still one tap; a meal header ticks/unticks that whole meal,
// and each item can be toggled on its own. "Put in" optionally files the
// ticked items under a different meal (Tuesday's lunch → today's dinner).
// copyFoodLogs re-inserts the raw rows as new rows (fresh ids), so this
// never touches or moves the source day's own entries.
//
// mode="slots" (Slots view) previews and copies the source day's day_slots
// instead of its meal groups, via copyDaySlots (which also recreates the
// slot rows themselves, not just the items in them — see lib/db.js).
export default function CopyDayModal({ destDate, onClose, onCopied, mode = 'meals' }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [sourceDate, setSourceDate] = useState(() => shiftDateStr(destDate, -1));
  const [rows, setRows] = useState([]);
  const [slotRows, setSlotRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [destMeal, setDestMeal] = useState(COPY_DEST_SAME);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetch = mode === 'slots'
      ? getDaySlots(user.id, sourceDate).then((data) => { setSlotRows(data); setRows([]); })
      : getFoodLogsForDate(user.id, sourceDate).then((data) => { setRows(data); setSlotRows([]); });
    fetch
      .catch(() => { if (!cancelled) setError("Couldn't load that day."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, sourceDate, mode]);

  const items = useMemo(() => rows.map(mapRow), [rows]);
  const grouped = useMemo(() => {
    const g = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) (g[item.meal] || g.snacks).push(item);
    return g;
  }, [items]);
  const slots = useMemo(() => slotRows.map(mapSlotRow), [slotRows]);

  // A new source day means a new list — start with all of it ticked again,
  // so the default stays "copy the whole day".
  useEffect(() => { setSelected(new Set(items.map((i) => i.id))); }, [items]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const selectedCal = selectedItems.reduce((sum, i) => sum + i.cal, 0);

  async function handleCopy() {
    if (copying) return;
    if (mode === 'slots') {
      if (!slotRows.length) return;
      setCopying(true);
      setError(null);
      try {
        const result = await copyDaySlots(user.id, sourceDate, destDate);
        onCopied(result);
        close();
      } catch {
        setError("Couldn't copy — try again.");
        setCopying(false);
      }
      return;
    }
    if (!selectedItems.length) return;
    setCopying(true);
    setError(null);
    try {
      const created = await copyFoodLogs(user.id, rowsToCopy(rows, selected, destMeal), destDate);
      onCopied(created);
      close();
    } catch {
      setError("Couldn't copy — try again.");
      setCopying(false);
    }
  }

  const hasSource = mode === 'slots' ? slotRows.length > 0 : rows.length > 0;
  const canCopy = mode === 'slots' ? slotRows.length > 0 : selectedItems.length > 0;
  const today = todayLocalDate();
  const destLabel = destDate === today
    ? 'today'
    : new Date(destDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div
        onClick={e => e.stopPropagation()}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: 'calc(var(--vvh, 100vh) * 0.85)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{mode === 'slots' ? 'Copy slots' : 'Copy meals'} to {destLabel}</span>
          <button className="hit-slop" aria-label="Close" onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Copy from</div>
          <DaySelector selectedDate={sourceDate} onSelect={setSourceDate} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</p>
          ) : !hasSource ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>{mode === 'slots' ? 'No slots set up on this day.' : 'Nothing logged on this day.'}</p>
          ) : mode === 'slots' ? (
            slots.map((slot) => (
              <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>
                  {formatSlotTime(slot.slotTime)}
                </span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slot.label}</div>
              </div>
            ))
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedItems.length} of {items.length} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(selectedItems.length === items.length ? new Set() : new Set(items.map((i) => i.id)))}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '8px 0 8px 12px', minHeight: 32, fontFamily: 'inherit' }}
                >
                  {selectedItems.length === items.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {MEAL_ORDER.filter(m => grouped[m].length > 0).map(mealKey => {
                const ids = grouped[mealKey].map((i) => i.id);
                const onCount = ids.filter((id) => selected.has(id)).length;
                return (
                  <div key={mealKey} style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={onCount === ids.length ? true : onCount === 0 ? false : 'mixed'}
                      onClick={() => setSelected((prev) => toggleGroup(prev, ids))}
                      style={ROW_BUTTON}
                    >
                      <CheckMark state={onCount === ids.length ? 'on' : onCount === 0 ? 'off' : 'some'} />
                      <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{MEAL_LABELS[mealKey]}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>{onCount}/{ids.length}</span>
                    </button>
                    {grouped[mealKey].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected.has(item.id)}
                        onClick={() => setSelected((prev) => toggleGroup(prev, [item.id]))}
                        style={{ ...ROW_BUTTON, paddingLeft: 16 }}
                      >
                        <CheckMark state={selected.has(item.id) ? 'on' : 'off'} />
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{withBrand(item.name, item.brand)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(item.cal)} kcal</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {mode === 'meals' && hasSource && !loading && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Put in</div>
            <div role="radiogroup" aria-label="Put copied items in" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[[COPY_DEST_SAME, 'Same meal'], ...MEAL_ORDER.map((m) => [m, MEAL_LABELS[m]])].map(([value, label]) => {
                const on = destMeal === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDestMeal(value)}
                    style={{
                      padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      background: on ? 'var(--accent-bg)' : 'transparent',
                      border: `1px solid ${on ? 'var(--border-active)' : 'var(--border-default)'}`,
                      color: on ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', padding: '0 20px 8px', flexShrink: 0 }}>{error}</p>}

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
          <button
            onClick={handleCopy}
            disabled={!canCopy || copying}
            style={{ width: '100%', background: !canCopy || copying ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 600, color: !canCopy || copying ? 'var(--text-muted)' : 'var(--accent-contrast)', cursor: !canCopy || copying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {copying
              ? 'Copying…'
              : mode === 'slots'
                ? (slotRows.length ? `Copy ${slotRows.length} slot${slotRows.length === 1 ? '' : 's'}` : 'Copy')
                : selectedItems.length
                  ? `Copy ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} · ${Math.round(selectedCal)} kcal`
                  : hasSource ? 'Select something to copy' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
