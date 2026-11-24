import { useState } from 'react';
import { ScanCard } from '../scan/ScanKit';
import { nutritionTiles } from '../../lib/entryNutrition';
import { round1 } from '../../lib/format';

const FONT = "'Plus Jakarta Sans', sans-serif";

const pctText = (pct) => (pct == null ? null : pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`);
const share = (value, target) => (target > 0 ? (Number(value) / target) * 100 : null);

// ─── The numbers: energy and the three macros for the amount chosen, each with
// its share of the day's goal underneath. ───────────────────────────────────
function SummaryColumn({ label, value, unit, color, pct, goal, first }) {
  const text = pctText(pct);
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, padding: first ? '0 8px 0 0' : '0 8px', borderLeft: first ? 'none' : '1px solid var(--border-default)' }} data-testid={`entry-${label.toLowerCase()}`}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, color: color || 'var(--text-primary)', margin: '6px 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{unit}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minHeight: 14, whiteSpace: 'nowrap' }}>
        {text && (
          <>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color || 'var(--text-primary)', flexShrink: 0 }} />
            {text}{goal ? ' goal' : ''}
          </>
        )}
      </div>
    </div>
  );
}

export function SummaryCard({ food, targets }) {
  return (
    <ScanCard style={{ display: 'flex', padding: '16px 8px 14px 16px' }} data-testid="entry-summary">
      <SummaryColumn first label="Energy" value={Math.round(food.cal || 0).toLocaleString('en-AU')} unit="kcal" pct={share(food.cal, targets.calories)} goal />
      <SummaryColumn label="Protein" value={round1(food.protein || 0)} unit="grams" color="var(--macro-protein)" pct={share(food.protein, targets.protein_g)} />
      <SummaryColumn label="Carbs" value={round1(food.carbs || 0)} unit="grams" color="var(--macro-carbs)" pct={share(food.carbs, targets.carbs_g)} />
      <SummaryColumn label="Fat" value={round1(food.fat || 0)} unit="grams" color="var(--macro-fat)" pct={share(food.fat, targets.fat_g)} />
    </ScanCard>
  );
}

// ─── A row of choices sharing one rounded track (units, meals, multipliers). ──
export function Segmented({ options, value, onChange, label, size = 'md', testId, equal = true }) {
  const small = size === 'sm';
  return (
    <div role="group" aria-label={label} data-testid={testId} style={{ display: 'flex', gap: 2, padding: 3, borderRadius: small ? 14 : 18, background: 'var(--chip-bg)' }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={active}
            style={{
              flex: equal ? '1 1 0' : '1 1 auto', minWidth: 0, minHeight: small ? 36 : 40, padding: equal ? '0 4px' : '0 8px', borderRadius: small ? 11 : 15, border: 'none', cursor: 'pointer', fontFamily: FONT,
              fontSize: small ? 12 : 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── How much: a big −/+ amount, with the unit it is in written underneath. ───
const roundBtn = { width: 44, height: 44, flexShrink: 0, borderRadius: 14, background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, fontFamily: FONT };

export function AmountStepper({ amount, onChange, step, unitLabel, min = 0 }) {
  const n = Number(amount) || 0;
  const move = (dir) => onChange(String(Math.max(min, Math.round((n + dir * step) * 100) / 100)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderRadius: 18, background: 'var(--bg-subtle)', border: '1px solid var(--card-border)' }}>
      <button type="button" onClick={() => move(-1)} aria-label="Decrease amount" style={roundBtn}><i className="ti ti-minus" aria-hidden="true" /></button>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <input
          aria-label="Amount" inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', background: 'none', border: 'none', outline: 'none', padding: 0, color: 'var(--text-primary)', fontSize: 34, fontWeight: 800, lineHeight: 1.1, fontFamily: FONT, MozAppearance: 'textfield' }}
        />
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 2 }}>{unitLabel}</div>
      </div>
      <button type="button" onClick={() => move(1)} aria-label="Increase amount" style={roundBtn}><i className="ti ti-plus" aria-hidden="true" /></button>
    </div>
  );
}

// ─── Nutrition: collapsed by default; opens to the nutrients this food has
// figures for, each with its share of your daily target. Everything else (and
// estimates for what is missing) is on the full details page. ────────────────
export function NutritionCard({ food, targets, onSeeAll }) {
  const [open, setOpen] = useState(false);
  const tiles = open ? nutritionTiles(food, targets) : [];
  return (
    <ScanCard style={{ padding: 0 }} data-testid="entry-nutrition">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT, color: 'var(--text-primary)' }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Nutrition</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{open ? 'Tap to collapse' : 'Details (tap to expand)'}</span>
        </span>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} />
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
            {tiles.map((t) => (
              <div key={t.key} data-testid="nutrition-tile" style={{ minWidth: 0, borderRadius: 16, padding: '10px 12px 12px', background: 'var(--bg-subtle)', border: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{t.label}</span>
                  {t.pct != null && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--chip-bg)', borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>{pctText(t.pct)}</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {t.value}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 3 }}>{t.unit}</span>
                </div>
                {t.added != null && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--macro-carbs)', marginTop: 4 }}>{t.added}g added</div>}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 2px 0', lineHeight: 1.45 }}>% is of your daily target.</p>
          <button
            type="button" onClick={onSeeAll}
            style={{ marginTop: 6, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 2px', background: 'none', border: 'none', color: 'var(--accent-secondary)', fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            <i className="ti ti-list-details" aria-hidden="true" style={{ fontSize: 16 }} /> See all nutrients
          </button>
        </div>
      )}
    </ScanCard>
  );
}
