import { useState } from 'react';
import DragSheet from '../DragSheet';
import NutritionFields from './NutritionFields';
import { PrimaryButton } from './ScanKit';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { toKcal, kcalFromMacros } from '../../lib/energy';

const num = (v) => Math.round((Number(v) > 0 ? Number(v) : 0) * 10) / 10;

// "Fix nutrition" for a scanned product: edit its energy (kcal or kJ) and
// macros. Saving updates what is about to be logged and the product itself for
// everyone who scans it afterwards (onApply does both).
export default function RecalculateBarcodeSheet({ result, onClose, onApply }) {
  const { closing, close } = useClosingTransition(onClose);
  const [values, setValues] = useState({
    cal: String(Math.round(result.cal || 0)), energyUnit: 'kcal',
    protein: String(result.protein ?? 0), carbs: String(result.carbs ?? 0), fat: String(result.fat ?? 0),
    fibre: String(result.fibre ?? 0), sugar: String(result.sugar ?? 0), sodium: String(result.sodium ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const change = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const kcal = toKcal(values.cal, values.energyUnit);
  const fromMacros = kcalFromMacros(values);
  const tooBig = kcal > 5000;

  async function save() {
    if (saving || tooBig) return;
    setSaving(true);
    setError(null);
    try {
      await onApply({
        cal: kcal, protein: num(values.protein), carbs: num(values.carbs), fat: num(values.fat),
        fibre: num(values.fibre), sugar: num(values.sugar), sodium: Math.round(Number(values.sodium) > 0 ? Number(values.sodium) : 0),
      });
      close();
    } catch (err) {
      console.error('Failed to apply nutrition fix:', err);
      setError('Couldn\'t save that. Try again.');
      setSaving(false);
    }
  }

  return (
    <DragSheet
      title="Fix nutrition" onClose={close} closing={closing}
      footer={(
        <PrimaryButton onClick={save} disabled={saving || tooBig}>{saving ? 'Saving…' : 'Save changes'}</PrimaryButton>
      )}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{result.brand ? `${result.brand} ` : ''}{result.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Per {result.serving || '1 serving'}</div>
      </div>
      <NutritionFields idPrefix="fix" values={values} onChange={change} />
      {fromMacros > 0 && fromMacros !== kcal && (
        <button
          type="button" onClick={() => setValues((v) => ({ ...v, cal: String(fromMacros), energyUnit: 'kcal' }))}
          style={{ marginTop: 12, background: 'none', border: 'none', padding: '8px 2px', minHeight: 44, color: 'var(--accent)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
        >
          Work out calories from the macros ({fromMacros} kcal)
        </button>
      )}
      {tooBig && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>Over 5,000 kcal. Check kcal or kJ.</div>}
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
    </DragSheet>
  );
}
