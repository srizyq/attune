import ServingStepper from '../ServingStepper';
import DayBudgetImpact from '../DayBudgetImpact';
import SeeDetails from '../FoodDetails';
import { formatTime12h } from '../../lib/mealTime';
import { energySplit, percentOf, macroNotes, nutritionRows, dietaryBadges, nutriScoreInfo, productInsight } from '../../lib/scanInsights';
import {
  ScanPage, ScanCard, Eyebrow, Chip, InsightCard, SplitBar, MacroTile, PillButton, PillRow,
  PrimaryButton, GhostButton, IconTile,
} from './ScanKit';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const selectStyle = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, background: 'var(--chip-bg)', border: '1px solid transparent', borderRadius: 14,
  padding: '0 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
};

// Portion shortcuts under the stepper: the pack's own serving (when the source
// really knows it), half of that, and a plain 100 g / 100 ml.
function portionPresets(result, servingUnit) {
  const presets = [];
  if (!result.servingIsFallback) {
    presets.push({ id: 'one', label: '1 serving', amount: 1, unit: 'serving' });
    presets.push({ id: 'half', label: '½ serving', amount: 0.5, unit: 'serving' });
  }
  presets.push({ id: '100', label: `100 ${servingUnit}`, amount: 100, unit: servingUnit });
  return presets;
}

// Barcode scan result as a full page: product card, how it fits today, energy
// + macros, portion and meal pickers, nutrition facts with % daily value, and
// a pinned Log bar. Pure presentation — the lookup, scaling and logging stay
// in BarcodeScanner (FoodSearch.jsx), which passes everything in.
export default function BarcodeResult({
  result, scaled, meta, barcode, calorieWarning, closing, onClose,
  amount, setAmount, unit, setUnit, units, servingUnit, gramsEquivalent,
  meal, setMeal, time, setTime, showSlots, recipeMode,
  dailyTarget, consumed, isFavourite, onToggleFavourite,
  onAdd, onAddAndScan, disabled, onRecalculate, fixNote, sheet,
}) {
  const hasTarget = dailyTarget.calories > 0;
  const dailyPct = percentOf(scaled.cal, dailyTarget.calories);
  const split = energySplit(scaled);
  const notes = macroNotes(scaled);
  const insight = productInsight(scaled, dailyTarget, consumed);
  const rows = nutritionRows(scaled);
  const badges = dietaryBadges({ labels: meta?.labels, food: scaled });
  const nutri = nutriScoreInfo(meta?.nutriscore);
  const presets = portionPresets(result, servingUnit);
  const kcal = Math.round(scaled.cal);
  const logLabel = recipeMode ? `Add ${kcal} kcal to recipe` : showSlots ? `Log ${kcal} kcal at ${formatTime12h(time)}` : `Log ${kcal} kcal to ${meal}`;

  return (
    <ScanPage
      title="Food detail" onBack={onClose} closing={closing} testId="barcode-result"
      footer={(
        <>
          <PrimaryButton onClick={onAdd} disabled={disabled}>
            <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logLabel}</span>
          </PrimaryButton>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <GhostButton onClick={onAddAndScan} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
              <i className="ti ti-barcode" aria-hidden="true" style={{ fontSize: 16 }} /> Log &amp; scan another
            </GhostButton>
            <GhostButton onClick={onClose}>Cancel</GhostButton>
          </div>
        </>
      )}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', minWidth: 0 }}>
        <Chip color="var(--accent-secondary)" icon="ti-circle-check">Product found</Chip>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
          <i className="ti ti-barcode" aria-hidden="true" /> {barcode}
        </span>
      </div>

      <ScanCard>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {meta?.image
            ? <img src={meta.image} alt="" style={{ width: 84, height: 84, flexShrink: 0, objectFit: 'contain', borderRadius: 16, background: '#fff', border: '1px solid var(--card-border)' }} />
            : <IconTile icon="ti-package" size={84} style={{ borderRadius: 22 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            {result.brand && (
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-secondary)', overflowWrap: 'anywhere' }}>{result.brand}</div>
            )}
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{result.name}</div>
            {result.serving && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>{result.serving}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {nutri && (
                <Chip color={nutri.color} icon="ti-leaf">NutriScore {nutri.grade}</Chip>
              )}
              <button
                type="button" onClick={onToggleFavourite} className="hit-slop"
                aria-label={isFavourite ? 'Remove favourite' : 'Add favourite'} aria-pressed={isFavourite}
                style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: 'var(--chip-bg)', color: isFavourite ? 'var(--accent-secondary)' : 'var(--text-muted)' }}
              >
                <i className={isFavourite ? 'ti ti-heart-filled' : 'ti ti-heart'} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </ScanCard>

      {fixNote && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '12px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <i aria-hidden="true" className="ti ti-circle-check" style={{ color: 'var(--accent-secondary)', fontSize: 16, flexShrink: 0, marginTop: 1 }} />
          <span>{fixNote}</span>
        </div>
      )}

      {calorieWarning && (
        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--gold)', borderRadius: 'var(--card-radius)', padding: '12px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <i aria-hidden="true" className="ti ti-alert-triangle" style={{ color: 'var(--gold)', fontSize: 16, flexShrink: 0, marginTop: 1 }} />
          <span>The calories here don't match this product's protein, carbs and fat, so one of them may be wrong. Check the pack's nutrition panel before logging.</span>
        </div>
      )}

      {insight && (
        <InsightCard icon="ti-bolt" title="Smart synergy" tag={insight.tag}>{insight.text}</InsightCard>
      )}

      <ScanCard>
        <Eyebrow>Total energy</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05, color: 'var(--text-primary)' }}>
            {kcal}<span style={{ fontSize: 17, fontWeight: 700, marginLeft: 4 }}>kcal</span>
          </div>
          {hasTarget && dailyPct != null && (
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <Chip color="var(--accent-secondary)">{dailyPct}% daily value</Chip>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Goal {Math.round(dailyTarget.calories)} kcal</div>
            </div>
          )}
        </div>
        <SplitBar split={split} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <MacroTile kind="protein" label="Protein" value={scaled.protein} note={notes.protein} />
          <MacroTile kind="carbs" label="Carbs" value={scaled.carbs} note={notes.carbs} />
          <MacroTile kind="fat" label="Fat" value={scaled.fat} note={notes.fat} />
        </div>
        {hasTarget && (
          <div style={{ marginTop: 14 }}>
            <DayBudgetImpact target={dailyTarget.calories} consumed={consumed.cal} adding={scaled.cal} />
          </div>
        )}
      </ScanCard>

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <Eyebrow>Adjust portion</Eyebrow>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <ServingStepper amount={amount} setAmount={setAmount} step={unit === 'serving' ? 0.5 : unit === 'g' || unit === 'ml' ? 10 : 1} />
          <label style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>Serving unit</span>
            <select aria-label="Serving unit" value={unit} onChange={e => setUnit(e.target.value)} style={selectStyle}>
              {units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
        </div>
        <PillRow label="Portion shortcuts">
          {presets.map(p => (
            <PillButton
              key={p.id}
              active={Number(amount) === p.amount && unit === p.unit}
              onClick={() => { setAmount(p.amount); setUnit(p.unit); }}
            >
              {p.label}
            </PillButton>
          ))}
        </PillRow>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, overflowWrap: 'anywhere' }}>
          {unit !== servingUnit && `≈${gramsEquivalent}${servingUnit} · `}Label serving: {result.serving}
        </div>
      </ScanCard>

      {!recipeMode && (
        <ScanCard>
          <Eyebrow style={{ marginBottom: 10 }}>{showSlots ? 'Log at' : 'Assign to meal'}</Eyebrow>
          {showSlots ? (
            <input
              type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Time"
              style={{ ...selectStyle, minHeight: 44 }}
            />
          ) : (
            <PillRow label="Meal" wrap>
              {MEALS.map(m => <PillButton key={m} active={meal === m} onClick={() => setMeal(m)}>{m}</PillButton>)}
            </PillRow>
          )}
        </ScanCard>
      )}

      {onRecalculate && (
        <button
          type="button" onClick={onRecalculate}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, marginBottom: 12, background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 'var(--card-radius)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          <i className="ti ti-edit" aria-hidden="true" style={{ fontSize: 16 }} /> Numbers look wrong? Recalculate
        </button>
      )}

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Nutrition facts</div>
          <Eyebrow style={{ fontSize: 10, textAlign: 'right' }}>% daily value</Eyebrow>
        </div>
        {rows.map((r, i) => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-default)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                {r.label} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.value}{r.unit}</span>
              </div>
              {r.sub && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-secondary)' }}>{r.sub}</div>}
            </div>
            {r.dv != null && <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>{r.dv}%</span>}
          </div>
        ))}
              <SeeDetails food={scaled} style={{ marginTop: 6, padding: 0 }} />
      </ScanCard>

      {badges.length > 0 && (
        <ScanCard>
          <Eyebrow style={{ marginBottom: 10 }}>Dietary check</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {badges.map(b => <Chip key={b} icon="ti-check">{b}</Chip>)}
          </div>
        </ScanCard>
      )}
      {sheet}
    </ScanPage>
  );
}
