import { useState } from 'react';
import MacroPreviewBar from '../MacroPreviewBar';
import Slider from '../Slider';
import { fieldStyle, labelStyle } from './constants';
import { buildTargets, splitFromGrams, goalMacroSplits } from '../../lib/calorieTargets';
import { TARGET_FIELDS, WEEKDAYS, dayTargetsToInputs, parseDayTargetInputs } from '../../lib/dayTargets';

// A percentage split, clamped the same way the sliders below are (protein
// 10-60%, fat 10-50%, carbs whatever's left) — so a slider's displayed
// position always matches the value React thinks it holds, even for a split
// no one built with these sliders (an old client, or one set some other way).
function clampSplit(split) {
  const protein = Math.min(60, Math.max(10, Math.round((split.protein || 0) * 100)));
  const fat = Math.min(50, Math.max(10, Math.round((split.fat || 0) * 100)));
  return { proteinPct: protein, fatPct: fat };
}

// Trainer-editable calorie/macro targets, plus (once the database has the
// rest-day columns) optional different targets for the client's rest days.
//
// The coach only ever types one number — calories — and then, if they want to
// steer it, drags a protein/fat split; carbs fill whatever's left, exactly the
// model the client's own Settings > Goals uses (lib/calorieTargets.js). Grams
// are always *derived* from calories × split, never typed directly, so they
// can't quietly disagree with each other the way free-typed grams used to.
// Opening an existing client's targets snaps their stored grams to the
// nearest whole-percent split to seed the sliders — re-saving without
// touching anything can shift a gram target by a gram or two as a result;
// that's the same rounding Settings > Goals already accepts for the client's
// own targets, not a new inconsistency.
export default function TargetsForm({ client, onSave, onCancel }) {
  const [calorieTarget, setCalorieTarget] = useState(client.calorie_target ?? '');
  const initialSplit = (client.protein_g || client.carbs_g || client.fat_g)
    ? splitFromGrams(client.protein_g || 0, client.carbs_g || 0, client.fat_g || 0)
    : (goalMacroSplits[client.goal] || goalMacroSplits.maintain);
  const initialPcts = clampSplit(initialSplit);
  const [proteinPct, setProteinPct] = useState(initialPcts.proteinPct);
  const [fatPct, setFatPct] = useState(initialPcts.fatPct);
  const carbPct = Math.max(0, 100 - proteinPct - fatPct);
  // Rest-day targets exist only once the SQL update has been run; until then
  // the client object simply has no such field and this section stays hidden.
  const supportsDay = 'rest_day_targets' in client;
  const initialDay = dayTargetsToInputs(client);
  const [restInputs, setRestInputs] = useState(initialDay.inputs);
  const [trainingDays, setTrainingDays] = useState(initialDay.trainingDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const split = { protein: proteinPct / 100, carbs: carbPct / 100, fat: fatPct / 100 };
  const computed = buildTargets(Number(calorieTarget) || 0, split);
  const baseValues = { calories: calorieTarget, protein_g: computed.protein.g, carbs_g: computed.carbs.g, fat_g: computed.fat.g };

  const handleSave = async () => {
    setError(null);
    // Only sent when it changed, so saving the everyday targets never touches
    // (or needs the database support for) the rest-day ones.
    let day;
    if (supportsDay) {
      const parsed = parseDayTargetInputs(restInputs, trainingDays);
      if (parsed.error) { setError(parsed.error); return; }
      const before = dayTargetsToInputs(client);
      const beforeParsed = parseDayTargetInputs(before.inputs, before.trainingDays);
      if (JSON.stringify([parsed.rest, parsed.trainingDays]) !== JSON.stringify([beforeParsed.rest, beforeParsed.trainingDays])) day = { rest: parsed.rest, trainingDays: parsed.trainingDays };
    }
    setSaving(true);
    try {
      // No calorie target means no macro targets either — grams only ever
      // mean something as a share of a calorie number.
      const hasCalories = calorieTarget !== '';
      await onSave({
        calorie_target: hasCalories ? Number(calorieTarget) : null,
        protein_g: hasCalories ? computed.protein.g : null,
        carbs_g: hasCalories ? computed.carbs.g : null,
        fat_g: hasCalories ? computed.fat.g : null,
      }, day);
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="target-calories" style={labelStyle}>Calorie target (kcal)</label>
        <input id="target-calories" type="number" min="0" value={calorieTarget} onChange={e => setCalorieTarget(e.target.value)} style={fieldStyle} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={labelStyle}>Protein</span>
          <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>{proteinPct}%</span>
        </div>
        <Slider aria-label="Protein share of calories" value={proteinPct} min={10} max={60} onChange={v => setProteinPct(Math.min(v, 100 - fatPct))} color="var(--accent)" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={labelStyle}>Fat</span>
          <span style={{ color: 'var(--ai-purple)', fontSize: 12, fontWeight: 600 }}>{fatPct}%</span>
        </div>
        <Slider aria-label="Fat share of calories" value={fatPct} min={10} max={50} onChange={v => setFatPct(Math.min(v, 100 - proteinPct))} color="var(--ai-purple)" />
      </div>

      <div style={{ marginBottom: 6 }}>
        <MacroPreviewBar label="Protein" grams={computed.protein.g} calories={computed.protein.cal} pct={split.protein} color="var(--accent)" />
        <MacroPreviewBar label="Carbs" grams={computed.carbs.g} calories={computed.carbs.cal} pct={split.carbs} color="var(--water-blue)" />
        <MacroPreviewBar label="Fat" grams={computed.fat.g} calories={computed.fat.cal} pct={split.fat} color="var(--ai-purple)" />
        <p style={{ color: 'var(--text-hint)', fontSize: 11, margin: '2px 0 0' }}>Carbs ({carbPct}%) fill whatever protein and fat leave.</p>
      </div>
      {supportsDay && (
        <div style={{ margin: '16px 0 14px', paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Rest days (optional)</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
            The targets above apply on training days. Pick the training days, then set different targets for the other days — leave a field blank to keep the same number.
          </p>
          <div role="group" aria-label="Training days" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {WEEKDAYS.map(d => {
              const on = trainingDays.includes(d.dow);
              return (
                <button
                  key={d.dow}
                  type="button"
                  aria-pressed={on}
                  aria-label={d.label}
                  onClick={() => setTrainingDays(cur => (cur.includes(d.dow) ? cur.filter(x => x !== d.dow) : [...cur, d.dow]))}
                  className="btn-press"
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", background: on ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--accent-dark)' : 'var(--border-strong)'}`, color: on ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <div className="grid-4" style={{ marginBottom: 6 }}>
            {TARGET_FIELDS.map(f => (
              <div key={f.key}>
                <label htmlFor={`rest-${f.key}`} style={labelStyle}>Rest-day {f.label.toLowerCase()} ({f.unit})</label>
                <input
                  id={`rest-${f.key}`}
                  type="number"
                  min="0"
                  value={restInputs[f.key]}
                  placeholder={baseValues[f.key] !== '' ? String(baseValues[f.key]) : ''}
                  onChange={e => setRestInputs(cur => ({ ...cur, [f.key]: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-press"
          style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        <button
          onClick={onCancel}
          className="btn-press"
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
