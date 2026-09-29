import { getWorkoutType } from '../../lib/workoutMath';
import { Card, SectionLabel } from './shared';
import ListRow from '../ListRow';

// A read-only list of a client's logged workouts — the trainer sees them
// (workout_logs has a trainer read policy) but never edits them. Uses
// ListRow's visuals for consistency with the rest of the app, but stays
// non-interactive (no onClick/chevron) since every field is already shown
// here and there's no action to relocate into a detail view.
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
              <ListRow
                key={w.id}
                avatar={<ListRow.SquareAvatar icon={type.icon} />}
                title={type.label}
                subtitleParts={[
                  showDate ? new Date(w.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null,
                  w.intensity ? w.intensity.charAt(0).toUpperCase() + w.intensity.slice(1) : null,
                  `${Math.round(w.durationMinutes)} min`,
                ]}
                trailing={<span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{Math.round(w.caloriesBurned)} kcal</span>}
              />
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
