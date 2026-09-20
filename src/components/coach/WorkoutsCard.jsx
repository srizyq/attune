import { getWorkoutType } from '../../lib/workoutMath';
import { Card, SectionLabel } from './shared';

// A read-only list of a client's logged workouts — the trainer sees them
// (workout_logs has a trainer read policy) but never edits them.
export default function WorkoutsCard({ title, workouts, loading, showDate = false, style }) {
  const total = workouts.reduce((s, w) => s + w.caloriesBurned, 0);
  return (
    <Card style={style}>
      <SectionLabel icon="ti-barbell">{title}</SectionLabel>
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : workouts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No workouts logged.</p>
      ) : (
        <>
          {workouts.map(w => {
            const type = getWorkoutType(w.type);
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-default)' }}>
                <i className={`ti ${type.icon}`} style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{type.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {showDate ? `${new Date(w.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ` : ''}{w.intensity} · {Math.round(w.durationMinutes)} min
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{Math.round(w.caloriesBurned)} kcal</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{workouts.length} {workouts.length === 1 ? 'session' : 'sessions'}</span>
            <span>{Math.round(total)} kcal burned</span>
          </div>
        </>
      )}
    </Card>
  );
}
