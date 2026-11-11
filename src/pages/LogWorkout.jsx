import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { WORKOUT_TYPES, INTENSITIES, estimateWorkoutCalories, weightInKg } from '../lib/workoutMath';
import { todayLocalDate } from '../lib/patterns';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/SegmentedControl';

const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };
const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '11px 12px', minHeight: 44, color: 'var(--text-primary)', fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

// Log a workout (a page, /workout/log?date=): type, intensity, duration, and a
// MET-estimated calorie figure you can overwrite. Saves onto the day the
// Dashboard was showing and returns to it.
export default function LogWorkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile } = useProfile();
  const requested = params.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : todayLocalDate();
  const { create } = useWorkoutLogs(date);
  const weightKg = weightInKg(profile);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const close = () => navigate('/dashboard', { state: { date } });

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
      await create({ type, intensity, durationMinutes, caloriesBurned: caloriesBurned || 0 });
      close();
    } catch (err) {
      console.error('Failed to save workout:', err);
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="dashboard" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Log a workout" subtitle={date === todayLocalDate() ? 'Today' : date} onBack={close} backLabel="Back to Dashboard" />
        <div className="page-pad">
          <div style={{ maxWidth: 520 }}>
        <div style={labelStyle}>Type</div>
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

        <div style={labelStyle}>Intensity</div>
        <div style={{ marginBottom: 18 }}>
          <SegmentedControl options={INTENSITIES} value={intensity} onChange={setIntensity} fill />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="wk-dur" style={labelStyle}>Duration (min)</label>
            <input id="wk-dur" type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="wk-cal" style={labelStyle}>Calories burned</label>
            <input
              id="wk-cal"
              type="number" min="0" step="any" value={calories}
              onChange={e => { setCaloriesTouched(true); setCalories(e.target.value); }}
              style={fieldStyle}
            />
          </div>
        </div>

        {error && <div style={{ background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={saving}
          style={{
            width: '100%', background: saving ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8,
            padding: '12px', minHeight: 44, fontSize: 14, fontWeight: 600, color: saving ? 'var(--text-muted)' : 'var(--accent-contrast)',
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save workout'}
        </button>
          </div>
        </div>
      </div>
    </div>
  );
}
