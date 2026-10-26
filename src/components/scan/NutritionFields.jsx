import { ENERGY_UNITS, toKcal } from '../../lib/energy';

// The numbers of a product's nutrition panel, each box with its own title so
// it's clear what goes where. Shared by "Add product" and "Fix nutrition".
// `values` holds strings (cal, energyUnit, protein, carbs, fat, fibre, sodium,
// sugar); `onChange(key, value)` updates one.
const inputStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
  borderRadius: 14, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};

export function Labeled({ id, label, hint, children, style }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 2px 5px' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 2px 0', lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

const NUTRIENTS = [
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['fibre', 'Fibre', 'g'],
  ['sugar', 'Sugar', 'g'],
  ['sodium', 'Sodium', 'mg'],
];

export default function NutritionFields({ values, onChange, idPrefix = 'nf' }) {
  const unit = values.energyUnit === 'kJ' ? 'kJ' : 'kcal';
  const kcal = toKcal(values.cal, unit);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
      <Labeled
        id={`${idPrefix}-energy`} label="Energy" style={{ gridColumn: '1 / -1' }}
        hint={unit === 'kJ' && values.cal !== '' ? `~ ${kcal} kcal` : undefined}
      >
        <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
          <input id={`${idPrefix}-energy`} type="number" inputMode="decimal" min="0" placeholder={unit === 'kJ' ? 'Energy (kJ)' : 'Calories (kcal)'} value={values.cal} onChange={(e) => onChange('cal', e.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
          <div role="group" aria-label="Energy unit" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {ENERGY_UNITS.map((u) => (
              <button
                key={u} type="button" aria-pressed={unit === u} onClick={() => onChange('energyUnit', u)}
                style={{
                  minWidth: 48, minHeight: 44, borderRadius: 12, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  background: unit === u ? 'var(--accent)' : 'var(--bg-card)', color: unit === u ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                  border: `1px solid ${unit === u ? 'var(--accent)' : 'var(--border-strong)'}`,
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </Labeled>
      {NUTRIENTS.map(([key, label, suffix]) => (
        <Labeled key={key} id={`${idPrefix}-${key}`} label={`${label} (${suffix})`}>
          <input id={`${idPrefix}-${key}`} type="number" inputMode="decimal" min="0" placeholder="0" value={values[key]} onChange={(e) => onChange(key, e.target.value)} style={inputStyle} />
        </Labeled>
      ))}
    </div>
  );
}
