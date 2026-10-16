import { useEffect, useRef, useState } from 'react';
import { getCustomFoods } from '../../lib/db';
import { searchPlanFoods } from '../../lib/planFoodSearch';
import { fieldStyle } from './constants';

const SEARCH_DELAY_MS = 300;

// Search the food database from inside the meal plan editor: AUSNUT, common
// dishes and the coach's own foods. Picking one hands it back (see
// itemFromFood in lib/mealPlan.js) — the editor adds it at a default weight.
export default function PlanFoodPicker({ trainerId, mealLabel, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const customRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setSearching(false); setError(null); return undefined; }
    setSearching(true);
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        // The coach's own foods are fetched once, then filtered locally.
        if (customRef.current === null) customRef.current = trainerId ? await getCustomFoods(trainerId).catch(() => []) : [];
        const found = await searchPlanFoods(q, { customFoods: customRef.current ?? [] });
        if (requestId !== requestRef.current) return; // a newer search has started
        setResults(found);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        console.error('Plan food search failed:', err);
        setError("Couldn't search just now — try again.");
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, trainerId]);

  const describe = (f) => (f.per100
    ? `${f.per100.calories} kcal · P ${f.per100.protein_g}g per 100g`
    : `${f.fixed.calories} kcal · P ${f.fixed.protein_g}g per ${f.servingLabel || 'serving'}`);

  return (
    <div role="group" aria-label={`Add a food to ${mealLabel}`} style={{ marginTop: 8, padding: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods — e.g. chicken breast"
          aria-label={`Search foods for ${mealLabel}`}
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button onClick={onClose} aria-label="Close food search" className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}><i className="ti ti-x" /></button>
      </div>
      <div style={{ marginTop: 8 }} aria-live="polite">
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '4px 0' }}>{error}</p>}
        {searching && <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0' }}>Searching…</p>}
        {!searching && results && results.length === 0 && !error && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0' }}>Nothing found. Try a simpler word, or add the item by hand.</p>
        )}
        {results && results.map((f) => (
          <button
            key={f.key}
            onClick={() => onPick(f)}
            className="btn-press"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: 13, overflowWrap: 'anywhere' }}>{f.name}</span>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{describe(f)}</span>
            </span>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>{f.src}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
