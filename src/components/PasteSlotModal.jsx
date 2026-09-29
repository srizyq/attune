import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getFoodLogsForDate, getDaySlots, pasteSlot } from '../lib/db';
import { mapSlotRow, formatSlotTime } from '../lib/daySlots';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { todayLocalDate } from '../lib/patterns';
import DaySelector from './DaySelector';

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// "Paste slot" — CopyDayModal's sibling for Slots mode: instead of copying
// a whole day, pick ONE slot from another day and add it (its label/time/
// target, plus whatever was logged in it) as a new slot appended onto the
// day currently being viewed. Never touches destDate's existing slots —
// see pasteSlot in lib/db.js.
export default function PasteSlotModal({ destDate, onClose, onPasted }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [sourceDate, setSourceDate] = useState(() => shiftDateStr(destDate, -1));
  const [slotRows, setSlotRows] = useState([]);
  const [itemRows, setItemRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pastingId, setPastingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getDaySlots(user.id, sourceDate), getFoodLogsForDate(user.id, sourceDate)])
      .then(([slots, items]) => {
        if (cancelled) return;
        setSlotRows(slots);
        setItemRows(items);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load that day."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, sourceDate]);

  const slots = useMemo(() => slotRows.map(mapSlotRow), [slotRows]);
  const itemsBySlot = useMemo(() => {
    const map = new Map();
    for (const row of itemRows) {
      if (!row.slot_id) continue;
      if (!map.has(row.slot_id)) map.set(row.slot_id, []);
      map.get(row.slot_id).push(row);
    }
    return map;
  }, [itemRows]);

  async function handlePaste(slot) {
    if (pastingId) return;
    setPastingId(slot.id);
    setError(null);
    try {
      const sourceSlotRow = slotRows.find((r) => r.id === slot.id);
      const items = itemsBySlot.get(slot.id) || [];
      const result = await pasteSlot(user.id, sourceSlotRow, items, destDate);
      onPasted(result);
      close();
    } catch {
      setError("Couldn't paste that slot — try again.");
      setPastingId(null);
    }
  }

  const today = todayLocalDate();
  const destLabel = destDate === today
    ? 'today'
    : new Date(destDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: 'calc(var(--vvh, 100vh) * 0.85)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Paste a slot onto {destLabel}</span>
          <button className="hit-slop" aria-label="Close" onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Copy from</div>
          <DaySelector selectedDate={sourceDate} onSelect={setSourceDate} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</p>
          ) : slots.length === 0 ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No slots set up on this day.</p>
          ) : (
            slots.map((slot) => {
              const items = itemsBySlot.get(slot.id) || [];
              const kcal = Math.round(items.reduce((sum, r) => sum + (Number(r.calories) || 0), 0));
              return (
                <button
                  key={slot.id}
                  onClick={() => handlePaste(slot)}
                  disabled={!!pastingId}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                    background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)',
                    cursor: pastingId ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>
                    {formatSlotTime(slot.slotTime)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {slot.label} {items.length > 0 && <span style={{ color: 'var(--text-muted)' }}>· {items.length} item{items.length === 1 ? '' : 's'}</span>}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {pastingId === slot.id ? 'Pasting…' : `${kcal} kcal`}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', padding: '0 20px 14px', flexShrink: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
