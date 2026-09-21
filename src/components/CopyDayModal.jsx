import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getFoodLogsForDate, copyFoodLogs } from '../lib/db';
import { mapRow } from '../hooks/useFoodLogs';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { todayLocalDate } from '../lib/patterns';
import DaySelector from './DaySelector';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// Copies a whole day's food onto destDate (whatever day DailyLog is
// showing): pick the source day on the week strip (starts on yesterday),
// see what's on it, tap once. copyFoodLogs re-inserts the raw rows as new
// rows (fresh ids), so this never touches or moves the source day's own
// entries.
export default function CopyDayModal({ destDate, onClose, onCopied }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [sourceDate, setSourceDate] = useState(() => shiftDateStr(destDate, -1));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFoodLogsForDate(user.id, sourceDate)
      .then(data => {
        if (cancelled) return;
        setRows(data);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load that day."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, sourceDate]);

  const items = useMemo(() => rows.map(mapRow), [rows]);
  const grouped = useMemo(() => {
    const g = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) (g[item.meal] || g.snacks).push(item);
    return g;
  }, [items]);

  async function handleCopy() {
    if (!rows.length || copying) return;
    setCopying(true);
    setError(null);
    try {
      const created = await copyFoodLogs(user.id, rows, destDate);
      onCopied(created);
      close();
    } catch {
      setError("Couldn't copy — try again.");
      setCopying(false);
    }
  }

  const totalCal = items.reduce((sum, i) => sum + i.cal, 0);
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
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Copy meals to {destLabel}</span>
          <button className="hit-slop" aria-label="Close" onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Copy from</div>
          <DaySelector selectedDate={sourceDate} onSelect={setSourceDate} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ color: 'var(--text-hint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nothing logged on this day.</p>
          ) : (
            MEAL_ORDER.filter(m => grouped[m].length > 0).map(mealKey => (
              <div key={mealKey} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{MEAL_LABELS[mealKey]}</div>
                {grouped[mealKey].map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(item.cal)} kcal</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', padding: '0 20px 8px', flexShrink: 0 }}>{error}</p>}

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
          <button
            onClick={handleCopy}
            disabled={!rows.length || copying}
            style={{ width: '100%', background: !rows.length || copying ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 600, color: !rows.length || copying ? 'var(--text-muted)' : '#0f0f0f', cursor: !rows.length || copying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {copying ? 'Copying…' : rows.length ? `Copy ${rows.length} item${rows.length === 1 ? '' : 's'} · ${Math.round(totalCal)} kcal` : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
