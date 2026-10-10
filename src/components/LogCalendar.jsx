import { todayLocalDate } from '../lib/patterns';
import { dayFillPct, dayIsOver } from '../lib/logCalendar';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Month calendar — each day cell fills up (bottom-to-top) based on how much
// was logged that day relative to the calorie target. Shared between the
// Progress page and the Dashboard so both stay visually in sync.
//
// `compact` + `streak` are Dashboard-only: its calendar sits inside a
// swipeable pager next to a much shorter hero card, so it needed to be
// physically smaller (tighter padding/gaps, a capped grid width instead
// of stretching to the full card) and to carry its own streak counter
// instead of the generic subtitle. Progress.jsx has room to spare and
// its own separate streak-badges section, so it doesn't pass either —
// defaulting both off keeps it exactly as it was.
export default function LogCalendar({ month, byDate, calorieTarget, loading, onPrevMonth, onNextMonth, canGoNext, onSelectDay, compact = false, streak }) {
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstOfMonth = new Date(year, monthIdx, 1);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const monthLabel = firstOfMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const today = todayLocalDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(todayLocalDate(new Date(year, monthIdx, day)));

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: compact ? 3 : 4 };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)', padding: compact ? 16 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 12 : 16 }}>
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Logging calendar</div>
          {!compact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Each day fills up the more you log toward your calorie target</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onPrevMonth} className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, display: 'flex' }} aria-label="Previous month">
            <i className="ti ti-chevron-left" />
          </button>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</div>
          <button onClick={onNextMonth} disabled={!canGoNext} className="hit-slop" style={{ background: 'none', border: 'none', color: canGoNext ? 'var(--text-muted)' : 'var(--text-faint, var(--border-default))', cursor: canGoNext ? 'pointer' : 'default', fontSize: 16, display: 'flex' }} aria-label="Next month">
            <i className="ti ti-chevron-right" />
          </button>
        </div>
      </div>
      <div style={{ maxWidth: compact ? 300 : '100%', marginLeft: compact ? 'auto' : 0, marginRight: compact ? 'auto' : 0 }}>
        <div style={{ ...gridStyle, marginBottom: compact ? 4 : 6 }}>
          {WEEKDAY_LABELS.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>{d}</div>)}
        </div>
        <div style={{ ...gridStyle, opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const day = byDate.get(dateStr);
            // A number, or a function of the date (rest days can have their own target).
            const dayTarget = typeof calorieTarget === 'function' ? calorieTarget(dateStr) : calorieTarget;
            const pct = dayFillPct(day, dayTarget);
            const over = dayIsOver(day, dayTarget);
            const isToday = dateStr === today;
            const isFuture = dateStr > today;
            return (
              <div
                key={dateStr}
                onClick={() => !isFuture && onSelectDay(dateStr)}
                title={day?.calories ? `${Math.round(day.calories)} kcal logged${over ? ' — over target' : ''}` : 'Nothing logged'}
                style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                  background: 'var(--bg-subtle)', border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border-default)'}`,
                  cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.35 : 1,
                }}
              >
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: over ? 'color-mix(in srgb, var(--over-target) 65%, transparent)' : 'color-mix(in srgb, var(--accent) 31%, transparent)', transition: 'height 0.4s ease, background 0.2s ease' }} />
                <div style={{ position: 'relative', fontSize: 10, color: pct > 55 ? 'var(--text-primary)' : 'var(--text-muted)', padding: compact ? 2 : 3 }}>{Number(dateStr.slice(-2))}</div>
              </div>
            );
          })}
        </div>
      </div>
      {compact && streak != null && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Logging streak</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{streak} {streak === 1 ? 'day' : 'days'}</span>
            <i className="ti ti-flame" style={{ fontSize: 14, color: 'var(--accent)' }} />
          </div>
        </div>
      )}
    </div>
  );
}
