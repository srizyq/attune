// Amount stepper — −/+ buttons flanking the amount input. Pair it with
// `ServingStepper.Multipliers` on its own full-width row (see AddControls
// in FoodSearch.jsx) for the common case of scaling a single, well-defined
// serving up or down — kept as a separate piece rather than built in here,
// since the chips want the full row width while the stepper itself should
// stay compact next to a unit select.
import SegmentedControl from './SegmentedControl';

export default function ServingStepper({ amount, setAmount, step = 1, min = 0 }) {
  const n = Number(amount) || 0;
  const dec = () => setAmount(String(Math.max(min, round(n - step))));
  const inc = () => setAmount(String(round(n + step)));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 3, width: 'fit-content', flexShrink: 0 }}>
      <button type="button" onClick={dec} aria-label="Decrease amount" className="hit-slop" style={stepBtn}>−</button>
      <input
        type="number" min={min} step="any" value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ width: 56, textAlign: 'center', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}
      />
      <button type="button" onClick={inc} aria-label="Increase amount" className="hit-slop" style={stepBtn}>+</button>
    </div>
  );
}

const MULTIPLIERS = [0.5, 1, 1.5, 2];

// Full-width quick-multiplier chips (0.5x/1x/1.5x/2x) — only makes sense
// when there's a real "1 unit" to multiply, e.g. a packaged product's own
// serving, so callers gate rendering this on that (see `unit === 'serving'`
// in AddControls) rather than it deciding that itself.
ServingStepper.Multipliers = function Multipliers({ amount, setAmount }) {
  return (
    <SegmentedControl
      fill
      options={MULTIPLIERS.map(m => ({ id: String(m), label: `${m}x` }))}
      value={String(Number(amount) || 0)}
      onChange={v => setAmount(v)}
    />
  );
};

function round(n) {
  return Math.round(n * 100) / 100;
}

const stepBtn = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6,
  color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
};
