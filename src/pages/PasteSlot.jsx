import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { getFoodLogsForDate, getDaySlots, pasteSlot } from '../lib/db';
import { mapSlotRow, formatSlotTime } from '../lib/daySlots';
import { todayLocalDate } from '../lib/patterns';
import DaySelector from '../components/DaySelector';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// "Paste slot" — the Copy page's sibling for Slots mode: instead of copying
// a whole day, pick ONE slot from another day and add it (its label/time/
// target, plus whatever was logged in it) as a new slot appended onto the
// day currently being viewed. Never touches destDate's existing slots —
// see pasteSlot in lib/db.js.
export default function PasteSlot() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { profile } = useProfile();
  const requested = params.get('date');
  const destDate = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : todayLocalDate();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  // Back to the log on the day being filled in (it refetches when it mounts).
  const close = () => navigate('/log', { state: { date: destDate } });
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
      await pasteSlot(user.id, sourceSlotRow, items, destDate);
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
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="log" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Paste a slot" subtitle={`onto ${destLabel}`} onBack={close} backLabel="Back to Daily log" />
        <div className="page-pad">
        <div style={{ padding: '0 0 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Copy from</div>
          <DaySelector selectedDate={sourceDate} onSelect={setSourceDate} />
        </div>

        <div style={{ padding: '10px 0' }}>
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
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', minHeight: 48,
                    background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)',
                    cursor: pastingId ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>
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

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
