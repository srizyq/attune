import { useState } from 'react';
import { ScanPage, ScanCard, Eyebrow, MacroTile } from './scan/ScanKit';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { DETAIL_GROUPS, nutrientDetail, detailCoverage } from '../lib/foodDetails';
import { hasProAccess } from '../lib/proAccess';
import { useProfile } from '../hooks/useProfile';
import { useFoodEstimate } from '../hooks/useMicroEstimates';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { round1 } from '../lib/format';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));

// One nutrient: its name and figure, and — where it has a usual daily target —
// how much of that this portion covers. An estimate is drawn fainter and marked
// ~; a nutrient the food has no figure for says so instead of showing 0.
function Row({ nutrient, detail, last }) {
  const none = detail.kind === 'none';
  const barPct = detail.pct != null ? Math.min(100, detail.pct) : null;
  return (
    <div style={{ padding: '9px 0', borderBottom: last ? 'none' : '1px solid var(--border-default)' }} data-kind={detail.kind}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{nutrient.label}</span>
        <span style={{ fontSize: 14, fontWeight: none ? 500 : 700, color: none ? 'var(--text-hint)' : detail.kind === 'estimated' ? 'var(--text-secondary)' : 'var(--text-primary)', flexShrink: 0 }}>
          {none ? 'Not reported' : detail.text}
        </span>
      </div>
      {!none && barPct != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--border-default)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${Math.max(barPct > 0 ? 2 : 0, barPct)}%`, background: nutrient.color, borderRadius: 99, opacity: detail.kind === 'estimated' ? 0.55 : 1 }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{detail.pct < 1 && detail.pct > 0 ? '<1' : Math.round(detail.pct)}%</span>
        </div>
      )}
      {detail.kind === 'estimated' && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 3 }}>{detail.via === 'ai' ? 'AI estimate' : 'Estimated from a similar food'}</div>}
    </div>
  );
}

/**
 * Every macro and micronutrient of a food, for the amount it is shown at, in
 * label order (carbohydrates, fats, vitamins, minerals). `food` has the app's
 * usual shape (cal, protein, carbs, fat, plus the micro keys). A nutrient the
 * food has no figure for reads "Not reported", or an estimate (marked ~) from
 * the closest similar food — and, with Pro, an AI estimate where none exists.
 * Percentages are of the usual daily target.
 */
export function FoodDetailsPage({ food, onClose, closing, pro }) {
  const { profile } = useProfile();
  const isPro = pro ?? hasProAccess(profile);
  const estimate = useFoodEstimate(food, { pro: isPro });
  const portion = food.servingLabel || (food.loggedAmount != null && food.loggedUnit ? `${food.loggedAmount} ${food.loggedUnit}` : null);
  const groups = DETAIL_GROUPS.map((g) => ({ ...g, rows: g.keys.map((key) => ({ key, detail: nutrientDetail(food, key, estimate) })) }));
  const coverage = detailCoverage(food, estimate);
  const total = coverage.measured + coverage.estimated + coverage.none;
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
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.4 }} data-testid="food-details-coverage">
          {coverage.measured} of {total} nutrients measured{coverage.estimated > 0 ? ` · ${coverage.estimated} estimated` : ''}{coverage.none > 0 ? ` · ${coverage.none} not reported` : ''}
        </div>
      </ScanCard>
      {groups.map((g) => (
        <ScanCard key={g.label}>
          <Eyebrow style={{ marginBottom: 4 }}>{g.label}</Eyebrow>
          {g.rows.map((r, i) => <Row key={r.key} nutrient={BY_KEY[r.key]} detail={r.detail} last={i === g.rows.length - 1} />)}
        </ScanCard>
      ))}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 4px 12px', lineHeight: 1.45 }}>
        {coverage.estimated > 0 ? '~ estimated. ' : ''}% is of the usual daily target.
        {!isPro && coverage.none > 0 ? ' Pro fills in nutrients a food doesn\u2019t report with AI estimates.' : ''}
      </p>
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
