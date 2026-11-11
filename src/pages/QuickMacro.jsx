import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { slotFromTime } from '../lib/daySlots';
import { todayLocalDate } from '../lib/patterns';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';

const fieldStyle = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '11px 12px', minHeight: 44, color: 'var(--text-primary)', fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

// Quick macro (a page, /log/quick-macro?date=): a manual cal/P/C/F entry with
// no food search behind it — for whatever doesn't have (or doesn't need) a
// matching food, logged straight into whichever slot is "current" the same way
// everything else on the Slots timeline is.
export default function QuickMacro() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile } = useProfile();
  const requested = params.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : todayLocalDate();
  const { daySlots, addFood } = useFoodLogs(date);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const close = () => navigate('/log', { state: { date } });

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
      await addFood({
        name: name.trim() || 'Quick macro',
        cal: calNum,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        source: 'quick-macro',
      }, undefined, new Date(), slotFromTime(daySlots)?.id ?? null);
      close();
    } catch {
      setError("Couldn't log that — try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="log" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Quick macro" subtitle={date === todayLocalDate() ? 'Today' : date} onBack={close} backLabel="Back to Daily log" />
        <div className="page-pad">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
            <div>
              <label htmlFor="qm-name" style={labelStyle}>Name (optional)</label>
              <input id="qm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein shake" style={fieldStyle} />
            </div>
            <div>
              <label htmlFor="qm-cal" style={labelStyle}>Calories</label>
              <input id="qm-cal" type="number" min="0" inputMode="decimal" required value={cal} onChange={(e) => setCal(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label htmlFor="qm-p" style={labelStyle}>Protein (g)</label>
                <input id="qm-p" type="number" min="0" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label htmlFor="qm-c" style={labelStyle}>Carbs (g)</label>
                <input id="qm-c" type="number" min="0" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label htmlFor="qm-f" style={labelStyle}>Fat (g)</label>
                <input id="qm-f" type="number" min="0" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} style={fieldStyle} />
              </div>
            </div>

            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}

            <button type="submit" disabled={!canSave} style={{ background: canSave ? 'var(--accent)' : 'var(--border-default)', border: 'none', borderRadius: 8, padding: '12px', minHeight: 44, fontSize: 14, fontWeight: 600, color: canSave ? 'var(--accent-contrast)' : 'var(--text-muted)', cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {saving ? 'Logging…' : 'Log it'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
