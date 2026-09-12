import { useEffect, useState } from 'react';
import { SettingsModal } from './settings/primitives';
import { WORKOUT_TYPES, INTENSITIES, estimateWorkoutCalories } from '../lib/workoutMath';

const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };
const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

export default function LogWorkoutModal({ weightKg, onClose, onSave, closing }) {
  const [type, setType] = useState(WORKOUT_TYPES[0].id);
  const [intensity, setIntensity] = useState('moderate');
  const [duration, setDuration] = useState('30');
  const [calories, setCalories] = useState(() => String(estimateWorkoutCalories(WORKOUT_TYPES[0].id, 'moderate', 30, weightKg)));
  const [caloriesTouched, setCaloriesTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Keeps the calorie field in sync with the MET estimate as long as the
  // user hasn't typed into it directly — the moment they do, their number
  // wins and stops getting silently overwritten by the next type/duration
  // change.
  useEffect(() => {
    if (caloriesTouched) return;
    setCalories(String(estimateWorkoutCalories(type, intensity, duration, weightKg)));
  }, [type, intensity, duration, weightKg, caloriesTouched]);

  async function submit() {
    const durationMinutes = Number(duration);
    const caloriesBurned = Number(calories);
    if (!durationMinutes || durationMinutes <= 0) { setError('Enter how long you worked out for.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ type, intensity, durationMinutes, caloriesBurned: caloriesBurned || 0 });
      onClose();
    } catch (err) {
      console.error('Failed to save workout:', err);
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsModal title="Log a workout" onClose={onClose} closing={closing}>
      <div style={{ padding: 20 }}>
        <label style={labelStyle}>Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
          {WORKOUT_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: type === t.id ? 'var(--accent-bg)' : 'var(--bg-subtle)',
                border: `1px solid ${type === t.id ? 'var(--border-active)' : 'var(--border-default)'}`,
                borderRadius: 10, padding: '10px 4px', cursor: 'pointer', fontFamily: 'inherit',
                color: type === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 18 }} />
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{t.label}</span>
            </button>
          ))}
        </div>

        <label style={labelStyle}>Intensity</label>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2, marginBottom: 18 }}>
          {INTENSITIES.map(i => (
            <button
              key={i.id}
              onClick={() => setIntensity(i.id)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 18, border: 'none',
                background: intensity === i.id ? 'var(--accent)' : 'transparent',
                color: intensity === i.id ? '#0f0f0f' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {i.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Calories burned</label>
            <input
              type="number" min="0" step="any" value={calories}
              onChange={e => { setCaloriesTouched(true); setCalories(e.target.value); }}
              style={fieldStyle}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 18 }}>
          Estimated from your weight, type, intensity, and duration — edit it if you know the real number.
        </div>

        {error && <div style={{ background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={saving}
          style={{
            width: '100%', background: saving ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8,
            padding: '12px', fontSize: 14, fontWeight: 600, color: saving ? 'var(--text-muted)' : '#0f0f0f',
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      </div>
    </SettingsModal>
  );
}
