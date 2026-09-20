import { useState } from 'react';
import { Card, SectionLabel } from './shared';
import { MICRO_GROUPS, fieldStyle, labelStyle } from './constants';
import { MICRO_NUTRIENTS } from '../../lib/microNutrients';
import { microTargetsToInputs, parseMicroTargetInputs } from '../../lib/microTargets';

// A coach's per-nutrient targets for a client (fibre, sodium, iron…). Blank
// means "use the standard guideline"; whatever's set here shows up on the
// client's own Nutrients page as their goal.
export default function MicroTargetsCard({ clientData, onSave }) {
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const customCount = Object.keys(clientData.micro_targets || {}).length;

  const startEditing = () => {
    setInputs(microTargetsToInputs(clientData.micro_targets));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const { targets, error: problem } = parseMicroTargetInputs(inputs);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(targets);
      setEditing(false);
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabel icon="ti-apple">Nutrient targets</SectionLabel>
        {!editing && (
          <button onClick={startEditing} className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 18, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-pencil" style={{ fontSize: 12 }} /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          {customCount === 0
            ? 'Standard guidelines — no custom nutrient targets set.'
            : `Custom targets set for ${customCount} ${customCount === 1 ? 'nutrient' : 'nutrients'}; the rest use standard guidelines.`}
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '-6px 0 16px', lineHeight: 1.5 }}>
            Leave a box blank to use the standard guideline shown in it.
          </p>
          {MICRO_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{group.label}</div>
              <div className="grid-3">
                {group.keys.map(key => {
                  const n = MICRO_NUTRIENTS.find(m => m.key === key);
                  const id = `micro-target-${key}`;
                  return (
                    <div key={key}>
                      <label htmlFor={id} style={labelStyle}>{n.label} ({n.unit})</label>
                      <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={inputs[key] ?? ''}
                        placeholder={n.defaultTarget != null ? String(n.defaultTarget) : '—'}
                        onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                        style={fieldStyle}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} className="btn-press" style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {saving ? 'Saving…' : 'Save nutrient targets'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-press" style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
