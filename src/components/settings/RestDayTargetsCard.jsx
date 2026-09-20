import { Card, SectionLabel } from './primitives';
import { TARGET_FIELDS, WEEKDAYS } from '../../lib/dayTargets';

const inputStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

// Optional different targets for rest days: pick the weekdays that are training
// days, then set the numbers for every other day. The everyday targets above
// stay the training-day targets; anything left blank here means "the same".
// `onChange` is called with a function (current state -> next state).
export default function RestDayTargetsCard({ inputs, trainingDays, onChange, baseTargets, adaptive, error }) {
  // Updates are functions of the latest state, not of this render's props, so a
  // fast run of taps or keystrokes can never overwrite one another.
  const toggleDay = (dow) => onChange((cur) => ({ ...cur, trainingDays: cur.trainingDays.includes(dow) ? cur.trainingDays.filter((d) => d !== dow) : [...cur.trainingDays, dow] }));
  const setField = (key, value) => onChange((cur) => ({ ...cur, inputs: { ...cur.inputs, [key]: value } }));

  return (
    <Card>
      <SectionLabel>Training &amp; rest days</SectionLabel>
      {adaptive ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Adaptive calories re-work your everyday target on their own, so separate rest-day targets aren't available in this mode. Switch to Calculated or Custom above to use them. Saving in adaptive mode turns any rest-day targets off.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
            Optional. Your targets above apply on training days. Choose your training days and set different numbers for the rest — leave a field blank to keep it the same. These are fixed numbers, so update them if your goal or everyday target changes.
          </p>
          <div role="group" aria-label="Training days" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {WEEKDAYS.map((d) => {
              const on = trainingDays.includes(d.dow);
              return (
                <button
                  key={d.dow}
                  type="button"
                  aria-pressed={on}
                  aria-label={d.label}
                  onClick={() => toggleDay(d.dow)}
                  className="btn-press"
                  style={{ padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", background: on ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--accent-dark)' : 'var(--border-strong)'}`, color: on ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {TARGET_FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`rest-${f.key}`} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>Rest-day {f.label.toLowerCase()} ({f.unit})</label>
                <input
                  id={`rest-${f.key}`}
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={inputs[f.key]}
                  placeholder={baseTargets?.[f.key] ? String(baseTargets[f.key]) : ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
    </Card>
  );
}
