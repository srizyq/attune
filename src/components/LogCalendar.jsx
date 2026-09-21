import { todayLocalDate } from '../lib/patterns';

// Accent is deliberately a literal hex, not var(--accent) — it's used
// below with a string-concatenated alpha suffix (C.green + '50'), which
// only works with an actual hex value, not a CSS custom property
// reference. It's fine because accent is the same hex in both themes by
// design (see index.css) — only bg/border/text below need var()s.
const C = {
  green: '#8fbc8f',
};

// How "full" a day looks in the calendar — calories logged as a share of
// the calorie target (capped at 100%, since the point is showing progress
// toward the goal, not how far over it someone went). With no target set,
// any logging at all just shows as full.
function dayFillPct(day, calorieTarget) {
  if (!day || !day.calories) return 0;
  if (!calorieTarget) return day.loggedMeals > 0 ? 100 : 0;
  return Math.min(100, Math.round((day.calories / calorieTarget) * 100));
}

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
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: compact ? 16 : 12, padding: compact ? 16 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 12 : 16 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Logging calendar</div>
          {!compact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Each day fills up the more you log toward your calorie target</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onPrevMonth} className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, display: 'flex' }} aria-label="Previous month">
            <i className="ti ti-chevron-left" />
          </button>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</div>
          <button onClick={onNextMonth} disabled={!canGoNext} className="hit-slop" style={{ background: 'none', border: 'none', color: canGoNext ? 'var(--text-muted)' : 'var(--text-faint, #2a2a2a)', cursor: canGoNext ? 'pointer' : 'default', fontSize: 16, display: 'flex' }} aria-label="Next month">
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
            const pct = dayFillPct(day, typeof calorieTarget === 'function' ? calorieTarget(dateStr) : calorieTarget);
            const isToday = dateStr === today;
            const isFuture = dateStr > today;
            return (
              <div
                key={dateStr}
                onClick={() => !isFuture && onSelectDay(dateStr)}
                title={day?.calories ? `${Math.round(day.calories)} kcal logged` : 'Nothing logged'}
                style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                  background: 'var(--bg-subtle)', border: `1px solid ${isToday ? C.green : 'var(--border-default)'}`,
                  cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.35 : 1,
                }}
              >
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: C.green + '50', transition: 'height 0.4s ease' }} />
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
