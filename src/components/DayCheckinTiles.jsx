import { useEffect, useRef, useState } from 'react';
import {
  MOODS, ENERGY_LABELS, SLEEP_QUALITY_LABELS, SLEEP_QUICK_PICKS, MIN_SLEEP_HOURS, MAX_SLEEP_HOURS,
  energyToLevel, levelToEnergy, stepSleepHours, formatSleep, tileSummary,
} from '../lib/dayCheckin';
import { isMissingColumnError } from '../lib/dbErrors';

// Mood / energy / sleep for the day being viewed: three tiles that open in
// place (one at a time), each saving straight to that day's check-in row. Every
// answer is optional and tapping the chosen option again clears it. Mount it
// with key={date} so a different day starts from that day's own answers.
//
// `checkin` is the day's row (or null), `onSave(fields)` upserts just those
// fields (the row's other columns — water included — are left alone).

const SLEEP_SAVE_DELAY_MS = 600;

const TILES = [
  { id: 'mood', label: 'Mood', icon: 'ti-mood-smile' },
  { id: 'energy', label: 'Energy', icon: 'ti-bolt' },
  { id: 'sleep', label: 'Sleep', icon: 'ti-moon' },
];

const optionBtn = (active) => ({
  flex: 1, minWidth: 0, minHeight: 44, borderRadius: 10, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
  border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`,
  background: active ? 'var(--accent-bg)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  transition: 'background 0.15s, border-color 0.15s',
});

const fieldLabel = { fontSize: 11, color: 'var(--text-hint)', marginBottom: 8 };

function MoodPanel({ checkin, save }) {
  return (
    <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Mood">
      {MOODS.map((m) => {
        const active = checkin?.mood === m.id;
        return (
          <button key={m.id} type="button" className="btn-press" aria-pressed={active} aria-label={m.label} title={m.label}
            onClick={() => save({ mood: active ? null : m.id })}
            style={{ ...optionBtn(active), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 2px' }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{m.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function EnergyPanel({ checkin, save }) {
  const level = energyToLevel(checkin?.energy);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Energy level">
        {ENERGY_LABELS.map((label, i) => {
          const n = i + 1;
          const active = level === n;
          return (
            <button key={label} type="button" className="btn-press" aria-pressed={active} aria-label={`${label}, ${n} of 5`}
              onClick={() => save({ energy: active ? null : levelToEnergy(n) })}
              style={{ ...optionBtn(active), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 2px' }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SleepPanel({ checkin, save, onError }) {
  const saved = checkin?.sleep_hours != null ? Number(checkin.sleep_hours) : null;
  const [draft, setDraft] = useState(null); // null = nothing typed yet, follow what's saved
  const hours = draft ?? saved;
  const quality = checkin?.sleep_quality ?? null;

  // Hours change in quick succession (a stepper held down), so save once things
  // go quiet — and never lose the last tap if the tile is closed or the page left.
  const timer = useRef(null);
  const pending = useRef(null);
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); saveRef.current({ sleep_hours: pending.current }).catch(() => {}); }
  }, []);

  function setHours(value) {
    setDraft(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      try { await save({ sleep_hours: value }); } catch (err) { setDraft(null); onError(err); }
    }, SLEEP_SAVE_DELAY_MS);
  }

  return (
    <div>
      <div style={fieldLabel}>Hours slept</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button type="button" className="btn-press" aria-label="Half an hour less" onClick={() => setHours(stepSleepHours(hours, -0.5))} disabled={hours != null && hours <= MIN_SLEEP_HOURS}
          style={{ ...optionBtn(false), flex: '0 0 44px', fontSize: 20, lineHeight: 1 }}>−</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 700, color: hours == null ? 'var(--text-hint)' : 'var(--text-primary)' }} aria-live="polite">
          {formatSleep(hours) || '—'}
        </div>
        <button type="button" className="btn-press" aria-label="Half an hour more" onClick={() => setHours(stepSleepHours(hours, 0.5))} disabled={hours != null && hours >= MAX_SLEEP_HOURS}
          style={{ ...optionBtn(false), flex: '0 0 44px', fontSize: 20, lineHeight: 1 }}>+</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {SLEEP_QUICK_PICKS.map((h) => (
          <button key={h} type="button" className="btn-press" aria-pressed={hours === h} onClick={() => setHours(h)}
            style={{ ...optionBtn(hours === h), fontSize: 13, fontWeight: 600, minHeight: 36 }}>{h}h</button>
        ))}
      </div>

      <div style={fieldLabel}>How well did you sleep?</div>
      <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Sleep quality">
        {SLEEP_QUALITY_LABELS.map((label, i) => {
          const n = i + 1;
          const active = quality === n;
          return (
            <button key={label} type="button" className="btn-press" aria-pressed={active} aria-label={`${label}, ${n} of 5`}
              onClick={async () => { try { await save({ sleep_quality: active ? null : n }); } catch (err) { onError(err); } }}
              style={{ ...optionBtn(active), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 2px' }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DayCheckinTiles({ checkin, onSave }) {
  const [open, setOpen] = useState(null); // null | 'mood' | 'energy' | 'sleep'
  const [error, setError] = useState(null);
  const summary = tileSummary(checkin);

  function showError(err) {
    console.error('Failed to save check-in:', err);
    setError(isMissingColumnError(err) ? "Sleep tracking isn't switched on for this account yet." : "Couldn't save — try again.");
  }
  async function save(fields) {
    setError(null);
    try { return await onSave(fields); } catch (err) { showError(err); throw err; }
  }
  // Mood and energy are fire-and-forget taps; failures are already shown above.
  const saveQuiet = (fields) => save(fields).catch(() => {});

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, margin: '0 0 10px 2px' }}>How are you today?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {TILES.map((t) => {
          const isOpen = open === t.id;
          const value = summary[t.id];
          return (
            <button key={t.id} type="button" className="btn-press" aria-expanded={isOpen} aria-controls="day-checkin-panel"
              onClick={() => { setOpen(isOpen ? null : t.id); setError(null); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0, padding: '12px 12px 11px', borderRadius: 14, cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'left',
                background: 'var(--bg-card)', border: `1px solid ${isOpen ? 'var(--border-active)' : 'var(--border-default)'}`,
                transition: 'border-color 0.15s',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <i className={`ti ${t.icon}`} aria-hidden="true" style={{ fontSize: 14, color: 'var(--accent)' }} />{t.label}
                </span>
                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} aria-hidden="true" style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0 }} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: value ? 'var(--text-primary)' : 'var(--text-hint)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value || 'Add'}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div id="day-checkin-panel" style={{ marginTop: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 16 }}>
          {open === 'mood' && <MoodPanel checkin={checkin} save={saveQuiet} />}
          {open === 'energy' && <EnergyPanel checkin={checkin} save={saveQuiet} />}
          {open === 'sleep' && <SleepPanel checkin={checkin} save={save} onError={() => {}} />}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 2px 0' }}>{error}</p>}
    </div>
  );
}
