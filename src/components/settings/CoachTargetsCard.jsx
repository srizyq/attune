import { Card, SectionLabel } from './primitives';
import { describeTrainingDays, TARGET_FIELDS } from '../../lib/dayTargets';
import { shortDate } from '../../lib/coachTargets';

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// Shown in place of the calorie, macro and rest-day cards while the client's
// coach owns those numbers. They're displayed exactly as the coach set them,
// and nothing on this page can change them — until the client takes them over,
// which tells the coach.
export default function CoachTargetsCard({ coachName, targets, setAt, profile, onTakeOver, busy, error }) {
  const name = coachName || 'your coach';
  const rest = profile?.rest_day_targets;
  const hasRest = rest && Array.isArray(profile?.training_days) && profile.training_days.length > 0;
  return (
    <Card>
      <SectionLabel>Targets from your coach</SectionLabel>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '-6px 0 16px', lineHeight: 1.6 }}>
        {name} set these{setAt ? ` on ${shortDate(setAt)}` : ''}. Your goal and activity settings don't change them.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 14, marginBottom: hasRest ? 14 : 18 }}>
        <Stat label="Calories" value={targets ? targets.calories.toLocaleString() : '—'} />
        <Stat label="Protein" value={targets ? `${targets.protein_g}g` : '—'} />
        <Stat label="Carbs" value={targets ? `${targets.carbs_g}g` : '—'} />
        <Stat label="Fat" value={targets ? `${targets.fat_g}g` : '—'} />
      </div>
      {hasRest && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 18px', lineHeight: 1.6 }}>
          Training days: {describeTrainingDays(profile.training_days)}. Rest days: {TARGET_FIELDS.filter((f) => rest[f.key] != null).map((f) => `${f.label} ${Number(rest[f.key]).toLocaleString()}${f.unit === 'g' ? 'g' : ' kcal'}`).join(' · ')}.
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onTakeOver}
          disabled={busy}
          className="btn-press"
          style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {busy ? 'Taking over…' : 'Take over my targets'}
        </button>
        <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>{name} will be told.</span>
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
    </Card>
  );
}
