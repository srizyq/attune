import { useState } from 'react';
import MacroPreviewBar from '../MacroPreviewBar';
import { fieldStyle, labelStyle } from './constants';

// Trainer-editable calorie/macro targets.
export default function TargetsForm({ client, onSave, onCancel }) {
  const [calorieTarget, setCalorieTarget] = useState(client.calorie_target ?? '');
  const [proteinG, setProteinG] = useState(client.protein_g ?? '');
  const [carbsG, setCarbsG] = useState(client.carbs_g ?? '');
  const [fatG, setFatG] = useState(client.fat_g ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Live preview as the trainer types — protein/carbs at 4 kcal/g, fat at
  // 9 kcal/g, each bar's share relative to the macros' own calorie total
  // (not the separately-typed calorie target, which the trainer may not
  // have reconciled to the gram values yet).
  const proteinCal = Math.round((Number(proteinG) || 0) * 4);
  const carbsCal = Math.round((Number(carbsG) || 0) * 4);
  const fatCal = Math.round((Number(fatG) || 0) * 9);
  const macroCalTotal = proteinCal + carbsCal + fatCal;
  const hasMacros = macroCalTotal > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        calorie_target: calorieTarget === '' ? null : Number(calorieTarget),
        protein_g: proteinG === '' ? null : Number(proteinG),
        carbs_g: carbsG === '' ? null : Number(carbsG),
        fat_g: fatG === '' ? null : Number(fatG),
      });
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Calorie target (kcal)</label>
        <input type="number" min="0" value={calorieTarget} onChange={e => setCalorieTarget(e.target.value)} style={fieldStyle} />
      </div>
      <div className="grid-3-fixed" style={{ marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Protein (g)</label>
          <input type="number" min="0" value={proteinG} onChange={e => setProteinG(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Carbs (g)</label>
          <input type="number" min="0" value={carbsG} onChange={e => setCarbsG(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Fat (g)</label>
          <input type="number" min="0" value={fatG} onChange={e => setFatG(e.target.value)} style={fieldStyle} />
        </div>
      </div>
      {hasMacros && (
        <div style={{ marginBottom: 6 }}>
          <MacroPreviewBar label="Protein" grams={Number(proteinG) || 0} calories={proteinCal} pct={proteinCal / macroCalTotal} color="var(--accent)" />
          <MacroPreviewBar label="Carbs" grams={Number(carbsG) || 0} calories={carbsCal} pct={carbsCal / macroCalTotal} color="var(--water-blue)" />
          <MacroPreviewBar label="Fat" grams={Number(fatG) || 0} calories={fatCal} pct={fatCal / macroCalTotal} color="var(--ai-purple)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '2px 0 0' }}>
            Adds up to {macroCalTotal.toLocaleString()} kcal from macros
            {calorieTarget !== '' && Math.abs(macroCalTotal - Number(calorieTarget)) > Number(calorieTarget) * 0.05
              ? ` — doesn't quite match the ${Number(calorieTarget).toLocaleString()} kcal target above`
              : ''}
          </p>
        </div>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
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
