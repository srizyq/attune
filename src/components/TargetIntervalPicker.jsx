import { formatTargetInterval } from '../lib/mealTime';

// A card-styled meal/time picker — label above, bold formatted value and a
// chevron below, with the actual native <select>/<input type="time">
// stretched invisibly over the whole card as the real interactive surface.
// Keeps native keyboard/VoiceOver/mobile-picker behaviour (and, for Slots
// mode, full minute precision) instead of a custom popover reimplementing
// all of that. showSlots picks between a clock-time slot ("Midday (12:45)")
// and a plain meal category ("Lunch").
export default function TargetIntervalPicker({ showSlots, meal, setMeal, time, setTime, meals }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '9px 12px', position: 'relative', flex: 1 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 3 }}>TARGET INTERVAL</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {showSlots ? formatTargetInterval(time) : meal}
        </span>
        <i className="ti ti-chevron-down" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
      {showSlots ? (
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          aria-label="Target interval"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }}
        />
      ) : (
        <select
          value={meal}
          onChange={e => setMeal(e.target.value)}
          aria-label="Meal"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
        >
          {meals.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
    </div>
  );
}
