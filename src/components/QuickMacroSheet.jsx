import { useState } from 'react';
import { useClosingTransition } from '../hooks/useClosingTransition';

const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '9px 10px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

// A manual cal/P/C/F entry with no food search behind it — for whatever
// doesn't have (or doesn't need) a matching food, logged straight into
// whichever slot is "current" the same way everything else on the Slots
// timeline is. onSubmit does the actual addFood call; this only owns the
// form.
export default function QuickMacroSheet({ onClose, onSubmit }) {
  const { closing, close } = useClosingTransition(onClose);
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const calNum = Number(cal);
  const canSave = Number.isFinite(calNum) && calNum > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim() || 'Quick macro',
        cal: calNum,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        source: 'quick-macro',
      });
      close();
    } catch {
      setError("Couldn't log that — try again.");
      setSaving(false);
    }
  }

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={`modal-panel${closing ? ' is-closing' : ''}`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderBottom: 'none', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 460, padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Quick macro</span>
          <button type="button" className="hit-slop" aria-label="Close" onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        <div>
          <label style={labelStyle}>Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein shake" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Calories</label>
          <input type="number" min="0" inputMode="decimal" required value={cal} onChange={(e) => setCal(e.target.value)} style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Protein (g)</label>
            <input type="number" min="0" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Carbs (g)</label>
            <input type="number" min="0" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Fat (g)</label>
            <input type="number" min="0" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} style={fieldStyle} />
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}

        <button type="submit" disabled={!canSave} style={{ background: canSave ? 'var(--accent)' : 'var(--border-default)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 600, color: canSave ? '#0f0f0f' : 'var(--text-muted)', cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          {saving ? 'Logging…' : 'Log it'}
        </button>
      </form>
    </div>
  );
}
