// Extracted from Settings.jsx so onboarding's macro-breakdown editor can
// use the exact same slider, not a re-implementation that could drift.
export default function Slider({ value, min, max, step = 1, onChange, color = 'var(--accent)' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        appearance: 'none',
        WebkitAppearance: 'none',
        height: '6px',
        borderRadius: '99px',
        background: `linear-gradient(to right, ${color} ${pct}%, var(--border-default) ${pct}%)`,
        outline: 'none',
        cursor: 'pointer',
      }}
    />
  );
}
