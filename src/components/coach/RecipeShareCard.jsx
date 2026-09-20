import { useEffect, useState } from 'react';
import { getSavedMeals, shareRecipeWithClient } from '../../lib/db';
import { Card, SectionLabel } from './shared';

export default // ─── Share a recipe ────────────────────────────────────────────────────────
// Copies one of the trainer's own saved meals into the client's saved
// meals — reuses whatever recipes the trainer already has from using the
// app themselves, rather than building a whole second recipe editor.
function RecipeShareCard({ trainerId, client }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState(null); // null | 'done' | error string

  useEffect(() => {
    let cancelled = false;
    if (!trainerId) return;
    setLoading(true);
    getSavedMeals(trainerId)
      .then(result => { if (!cancelled) setMeals(result); })
      .catch(err => { console.error('Failed to load saved meals:', err); if (!cancelled) setMeals([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trainerId]);

  const handleShare = async () => {
    const meal = meals.find(m => m.id === selectedId);
    if (!meal) return;
    setSharing(true);
    setStatus(null);
    try {
      await shareRecipeWithClient(client.id, meal.name, meal.items);
      setStatus('done');
      setSelectedId('');
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus(err.message || "Couldn't share — try again.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card>
      <SectionLabel icon="ti-tools-kitchen-2">Share a recipe</SectionLabel>
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
      ) : meals.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          You don't have any saved meals yet — create one from Food Search, then share it with {client.name || 'this client'} here.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Choose a saved meal…</option>
              {meals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button
              onClick={handleShare}
              disabled={!selectedId || sharing}
              className="btn-press"
              style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
            >
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </div>
          {status === 'done' && <p style={{ color: 'var(--accent)', fontSize: 12, margin: 0 }}>Shared — it's now in their saved meals.</p>}
          {status && status !== 'done' && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{status}</p>}
        </>
      )}
    </Card>
  );
}
