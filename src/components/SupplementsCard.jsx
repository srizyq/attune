import { useState } from 'react';
import Card from './Card';
import ModalPortal from './ModalPortal';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { SUPPLEMENT_FIELDS, nutrientsFromForm, supplementToFood, supplementSummary, isSupplement } from '../lib/supplements';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));
const cap = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const label = { fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' };

function AddSupplement({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [serving, setServing] = useState('1 tablet');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const nutrients = nutrientsFromForm(values);
  const canSave = name.trim().length > 0 && Object.keys(nutrients).length > 0 && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim().slice(0, 80), servingLabel: serving.trim().slice(0, 40) || '1 serving', nutrients });
      onClose();
    } catch (err) {
      console.error('Failed to save supplement:', err);
      setError("Couldn't save — try again.");
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a supplement" className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '90%', overflow: 'auto', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Add a supplement</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.4 }}>Enter what <strong>one serving</strong> contains, from the label. Leave out anything it doesn&apos;t list.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
            <div><label htmlFor="sup-name" style={cap}>Name</label><input id="sup-name" style={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Multivitamin" /></div>
            <div><label htmlFor="sup-serving" style={cap}>Serving</label><input id="sup-serving" style={input} value={serving} maxLength={40} onChange={(e) => setServing(e.target.value)} /></div>
          </div>
          {SUPPLEMENT_FIELDS.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div style={{ ...label, marginBottom: 8 }}>{g.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {g.keys.map((key) => (
                  <div key={key}>
                    <label htmlFor={`sup-${key}`} style={cap}>{BY_KEY[key].label} ({BY_KEY[key].unit})</label>
                    <input id={`sup-${key}`} style={input} type="number" inputMode="decimal" min="0" value={values[key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, minHeight: 46, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={save} disabled={!canSave} style={{ flex: 1, minHeight: 46, background: 'var(--accent)', border: 'none', borderRadius: 10, color: 'var(--accent-contrast)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.5 }}>{saving ? 'Saving…' : 'Save supplement'}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Your saved supplements: tap Take to log one as a 0 kcal entry for the day
 * being viewed (it then counts in every nutrient total), or add a new one.
 * `items` is the day's logged items, to show how many of each were taken.
 */
export default function SupplementsCard({ supplements, items, onTake, onCreate, onRemove, dayLabel }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const takenCount = (name) => (items || []).filter((i) => isSupplement(i) && i.name === name).length;

  async function take(row) {
    setBusy(row.id);
    try { await onTake(supplementToFood(row)); } catch (err) { console.error('Failed to log supplement:', err); } finally { setBusy(null); }
  }

  return (
    <Card style={{ padding: '18px 18px 14px', marginBottom: 20 }} data-testid="supplements-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ ...label, fontWeight: 800 }}>Supplements</div>
        <button type="button" onClick={() => setAdding(true)} style={{ minHeight: 44, padding: '0 6px', background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          <i className="ti ti-plus" aria-hidden="true" /> Add
        </button>
      </div>
      {supplements.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 6px', lineHeight: 1.45 }}>Add a multivitamin, vitamin D or fish oil and log it in one tap, so it counts towards your nutrients.</p>
      ) : supplements.map((row) => {
        const taken = takenCount(row.name);
        return (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border-default)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{row.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{row.serving_label} · {supplementSummary(row)}</div>
            </div>
            <button type="button" onClick={() => take(row)} disabled={busy === row.id} aria-label={`Take ${row.name} ${dayLabel || ''}`.trim()}
              style={{ flexShrink: 0, minHeight: 44, minWidth: 64, padding: '0 14px', background: taken ? 'var(--accent-bg)' : 'var(--accent)', border: taken ? '1px solid var(--border-active)' : 'none', borderRadius: 10, color: taken ? 'var(--accent)' : 'var(--accent-contrast)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {taken ? `✓ ${taken}×` : 'Take'}
            </button>
            <button type="button" onClick={() => onRemove(row.id)} aria-label={`Delete ${row.name}`} style={{ flexShrink: 0, width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 16, cursor: 'pointer' }}>
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {adding && <AddSupplement onSave={onCreate} onClose={() => setAdding(false)} />}
    </Card>
  );
}
