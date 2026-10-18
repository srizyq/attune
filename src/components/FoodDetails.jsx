import { useState } from 'react';
import { ScanPage, ScanCard, Eyebrow, MacroTile } from './scan/ScanKit';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { nutrientReading } from '../lib/foodDetails';
import { MICRO_GROUPS } from './coach/constants';
import { useFoodEstimate } from '../hooks/useMicroEstimates';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { round1 } from '../lib/format';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));

function Row({ label, reading, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: last ? 'none' : '1px solid var(--border-default)' }}>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: reading.kind === 'none' ? 500 : 700, color: reading.kind === 'none' ? 'var(--text-hint)' : reading.kind === 'estimated' ? 'var(--text-secondary)' : 'var(--text-primary)', flexShrink: 0 }}>{reading.text}</span>
    </div>
  );
}

/**
 * Every macro and micronutrient of a food, for the amount it is shown at.
 * `food` has the app's usual shape (cal, protein, carbs, fat, plus the micro
 * keys). Vitamins and minerals a food has no figure for read "No data", or an
 * estimate from the closest similar food (marked ~).
 */
export function FoodDetailsPage({ food, onClose, closing }) {
  const estimate = useFoodEstimate(food);
  const portion = food.servingLabel || (food.loggedAmount != null && food.loggedUnit ? `${food.loggedAmount} ${food.loggedUnit}` : null);
  const readings = MICRO_GROUPS.map((g) => ({ ...g, rows: g.keys.map((key) => ({ key, reading: nutrientReading(food, key, estimate) })) }));
  const anyEstimated = readings.some((g) => g.rows.some((r) => r.reading.kind === 'estimated'));
  return (
    <ScanPage title="Food details" onBack={onClose} closing={closing} zIndex={400} testId="food-details">
      <ScanCard>
        {food.brand && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-secondary)', overflowWrap: 'anywhere' }}>{food.brand}</div>}
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{food.name}</div>
        {portion && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>{portion}</div>}
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05, margin: '14px 0 12px', color: 'var(--text-primary)' }}>
          {Math.round(food.cal || 0)}<span style={{ fontSize: 17, fontWeight: 700, marginLeft: 4 }}>kcal</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MacroTile kind="protein" label="Protein" value={round1(food.protein || 0)} />
          <MacroTile kind="carbs" label="Carbs" value={round1(food.carbs || 0)} />
          <MacroTile kind="fat" label="Fat" value={round1(food.fat || 0)} />
        </div>
      </ScanCard>
      {readings.map((g) => (
        <ScanCard key={g.label}>
          <Eyebrow style={{ marginBottom: 4 }}>{g.label}</Eyebrow>
          {g.rows.map((r, i) => <Row key={r.key} label={BY_KEY[r.key].label} reading={r.reading} last={i === g.rows.length - 1} />)}
        </ScanCard>
      ))}
      {anyEstimated && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 4px 12px' }}>~ estimated from a similar food</p>}
    </ScanPage>
  );
}

/** A "See details" button that opens the page above for the food it is given. */
export default function SeeDetails({ food, style }) {
  const [open, setOpen] = useState(false);
  const { closing, close } = useClosingTransition(() => setOpen(false));
  return (
    <>
      <button
        type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 14px', background: 'transparent', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', ...style }}
      >
        <i className="ti ti-list-details" aria-hidden="true" style={{ fontSize: 16 }} /> See details
      </button>
      {open && <FoodDetailsPage food={food} onClose={close} closing={closing} />}
    </>
  );
}
