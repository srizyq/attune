import { todayLocalDate } from '../lib/patterns';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayLocalDate(d);
}

// A MacroFactor-style horizontal week strip, replacing the old bare
// "‹ Today ›" text nav — shows the whole calendar week (Sunday-start,
// matching LogCalendar's own week header elsewhere in the app) the
// selected day falls in, so you can see and jump to any day in it at a
// glance. The chevrons shift by a full week (±7 days from the selected
// day) rather than day-by-day, since single-day stepping is still
// available by tapping an adjacent day in the strip itself.
export default function DaySelector({ selectedDate, onSelect }) {
  const today = todayLocalDate();
  const weekStart = todayLocalDate(startOfWeek(selectedDate));
  const days = Array.from({ length: 7 }, (_, i) => shiftDateStr(weekStart, i));
  const nextWeekStart = shiftDateStr(weekStart, 7);
  const canGoNext = nextWeekStart <= today;

  function shiftWeek(delta) {
    const target = shiftDateStr(selectedDate, delta * 7);
    onSelect(target > today ? today : target);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => shiftWeek(-1)} className="hit-slop" aria-label="Previous week" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, display: 'flex', padding: 4, flexShrink: 0 }}>
        <i className="ti ti-chevron-left" />
      </button>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
        {days.map(dateStr => {
          const isSelected = dateStr === selectedDate;
          const isFuture = dateStr > today;
          const d = new Date(dateStr + 'T00:00:00');
          return (
            <button
              key={dateStr}
              disabled={isFuture}
              onClick={() => onSelect(dateStr)}
              style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 2px', borderRadius: 10, border: 'none', fontFamily: 'inherit',
                background: isSelected ? 'var(--accent)' : 'transparent',
                cursor: isFuture ? 'default' : 'pointer',
                opacity: isFuture ? 0.35 : 1,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? '#0f0f0f' : 'var(--text-muted)' }}>{WEEKDAY_LABELS[d.getDay()]}</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: isSelected ? '#0f0f0f' : 'var(--text-secondary)' }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <button onClick={() => shiftWeek(1)} disabled={!canGoNext} className="hit-slop" aria-label="Next week" style={{ background: 'none', border: 'none', color: canGoNext ? 'var(--text-muted)' : 'var(--border-strong)', cursor: canGoNext ? 'pointer' : 'default', fontSize: 16, display: 'flex', padding: 4, flexShrink: 0 }}>
        <i className="ti ti-chevron-right" />
      </button>
    </div>
  );
}
