import { useMemo, useState } from 'react';
import { Card, SectionLabel } from './primitives';
import { hasProAccess } from '../../lib/proAccess';
import { targetsForDate } from '../../lib/dayTargets';
import {
  LIMIT_MIN_CALORIES, currentOrUpcoming, pastLimits, daysLeft, periodLengthDays, endDateForDays,
  limitedTargets, startLimit, endLimitEarly,
} from '../../lib/calorieLimit';

const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 };
const PRESETS = [{ days: 7, label: '1 week' }, { days: 14, label: '2 weeks' }, { days: 30, label: '1 month' }];

const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `lim-${Date.now()}`);
const round50 = (n) => Math.round(n / 50) * 50;

function ProPill() {
  return <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>;
}

function MacroLine({ targets }) {
  return (
    <span>Protein {targets.protein_g ?? '—'}g · Carbs {targets.carbs_g ?? '—'}g · Fat {targets.fat_g ?? '—'}g</span>
  );
}

/**
 * Settings → Goals: hold your daily calories to a different number for a set
 * stretch (a cut before a holiday, a few easier weeks). Starts today, ends on
 * the date you pick, then everything goes back to normal by itself.
 *
 * `onSave(periods)` persists the new list; `today` is passed in (not read
 * here) so the card is testable and the whole page agrees on the date.
 */
export default function CalorieLimitCard({ profile, today, onSave, onUpgrade, pendingConfirmation = false, onConfirmEmail }) {
  const isPro = hasProAccess(profile);
  const current = currentOrUpcoming(profile, today);
  const past = pastLimits(profile, today);
  // Today's target ignoring any limit — what the limit is measured against.
  const normal = useMemo(() => targetsForDate({ ...profile, calorie_limit_periods: [] }, today), [profile, today]);

  const suggested = normal.calories ? Math.max(LIMIT_MIN_CALORIES, round50(normal.calories - 300)) : '';
  // What the person typed, or null until they do — the box shows the suggestion
  // meanwhile (the profile may still be loading when this first renders).
  const [typed, setTyped] = useState(null);
  const calories = typed ?? String(suggested || '');
  const [days, setDays] = useState(14);
  const [customEnd, setCustomEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const endDate = days === 'custom' ? customEnd : endDateForDays(today, days);
  const calNum = Number(calories);
  const preview = Number.isFinite(calNum) && calNum >= LIMIT_MIN_CALORIES && normal.calories ? limitedTargets(normal, { calories: calNum }) : null;
  const diff = normal.calories && Number.isFinite(calNum) ? Math.round(calNum - normal.calories) : null;

  async function persist(periods) {
    setSaving(true);
    setError(null);
    try {
      await onSave(periods);
      return true;
    } catch (err) {
      console.error('Failed to save calorie limit:', err);
      setError("Couldn't save — check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleStart() {
    const result = startLimit(profile?.calorie_limit_periods || [], { calories, endDate, today, id: newId(), nowIso: new Date().toISOString() });
    if (result.error) { setError(result.error); return; }
    await persist(result.periods);
  }

  async function handleEnd() {
    if (await persist(endLimitEarly(profile?.calorie_limit_periods || [], current.id, today))) setConfirmEnd(false);
  }

  const heading = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
      <SectionLabel>Temporary calorie limit</SectionLabel>
      <ProPill />
    </div>
  );

  if (!isPro) {
    return (
      <Card>
        {heading}
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Hold your daily calories to a different number for a set time — like a 2-week cut before a holiday — and have it switch back on its own afterwards. Pro only.
        </p>
        <button
          onClick={pendingConfirmation ? onConfirmEmail : onUpgrade}
          style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }}
        >
          <i className="ti ti-lock" aria-hidden="true" style={{ marginRight: 6 }} />
          {pendingConfirmation ? 'Confirm your email to unlock Pro' : 'Upgrade to Pro'}
        </button>
      </Card>
    );
  }

  if (current) {
    const total = periodLengthDays(current);
    const left = daysLeft(current, today);
    const applied = limitedTargets(normal, current);
    const done = Math.max(0, total - left);
    return (
      <Card>
        {heading}
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>
          {current.calories.toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>kcal a day</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          {current.start > today ? `Starts ${fmtDate(current.start)} · ` : ''}Until {fmtDate(current.end)} · <strong>{left} day{left === 1 ? '' : 's'} left</strong>
        </div>
        <div role="progressbar" aria-label="Days of the limit completed" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ height: 6, borderRadius: 3, background: 'var(--border-default)', overflow: 'hidden', margin: '12px 0' }}>
          <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: 'var(--accent)' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <MacroLine targets={applied} />
          {normal.calories ? <div>Your usual target is {normal.calories.toLocaleString()} kcal; it comes back on {fmtDate(endDateForDays(current.end, 2))}.</div> : null}
        </div>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          {confirmEnd ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmEnd(false)} disabled={saving} style={{ flex: 1, minHeight: 40, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Keep it</button>
              <button onClick={handleEnd} disabled={saving} style={{ flex: 1, minHeight: 40, background: 'transparent', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Ending…' : 'Yes, end it now'}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmEnd(true)} style={{ width: '100%', minHeight: 40, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>End limit early</button>
          )}
        </div>
        <PastLimits past={past} />
      </Card>
    );
  }

  return (
    <Card>
      {heading}
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
        Starts today and switches back to your usual target by itself when it ends. Protein, carbs and fat targets scale to match.
      </p>

      <label htmlFor="limit-calories" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Calories a day</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          id="limit-calories" type="number" inputMode="numeric" min={LIMIT_MIN_CALORIES} step="50"
          value={calories} onChange={(e) => { setTyped(e.target.value); setError(null); }}
          style={{ ...inputStyle, width: 130 }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kcal{normal.calories ? ` (usual: ${normal.calories.toLocaleString()})` : ''}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>For how long?</div>
      <div role="group" aria-label="Duration" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: days === 'custom' ? 10 : 14 }}>
        {[...PRESETS, { days: 'custom', label: 'Pick a date' }].map((p) => {
          const on = days === p.days;
          return (
            <button
              key={p.days} type="button" aria-pressed={on} onClick={() => { setDays(p.days); setError(null); }}
              style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: on ? 700 : 600, background: on ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--border-active)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {days === 'custom' && (
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="limit-end" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Last day of the limit</label>
          <input id="limit-end" type="date" min={today} value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setError(null); }} style={{ ...inputStyle, width: 180 }} />
        </div>
      )}

      {endDate && (
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          <div><strong>Today until {fmtDate(endDate)}</strong> ({periodLengthDays({ start: today, end: endDate })} day{periodLengthDays({ start: today, end: endDate }) === 1 ? '' : 's'})</div>
          {preview && <div style={{ color: 'var(--text-muted)' }}><MacroLine targets={preview} /></div>}
          {diff !== null && diff !== 0 && normal.calories && <div style={{ color: 'var(--text-muted)' }}>{Math.abs(diff).toLocaleString()} kcal a day {diff < 0 ? 'less' : 'more'} than usual</div>}
        </div>
      )}

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
      <button
        onClick={handleStart} disabled={saving || !calories || !endDate}
        style={{ width: '100%', minHeight: 44, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: saving || !calories || !endDate ? 'not-allowed' : 'pointer', background: saving || !calories || !endDate ? 'var(--border-default)' : 'var(--accent)', color: saving || !calories || !endDate ? 'var(--text-muted)' : 'var(--accent-contrast)' }}
      >
        {saving ? 'Starting…' : 'Start limit'}
      </button>
      <PastLimits past={past} />
    </Card>
  );
}

function PastLimits({ past }) {
  if (!past.length) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Past limits</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {past.slice(0, 5).map((p) => (
          <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>
            <span>{p.calories.toLocaleString()} kcal a day</span>
            <span style={{ color: 'var(--text-muted)' }}>{fmtShort(p.start)} – {fmtShort(p.end)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
