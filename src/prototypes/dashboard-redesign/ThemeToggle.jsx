// Shared toggle control used by every variant in this round — each variant
// owns its own light/dark token pair and local theme state; this is just
// the button that flips it, so the prototype actually demonstrates the
// requested feature (a real switch) rather than two static screenshots.
export default function ThemeToggle({ theme, onToggle, style, activeColor, trackColor }) {
  const isDark = theme === 'dark';
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        width: 40, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: trackColor, position: 'relative', padding: 0, flexShrink: 0,
        transition: 'background 200ms ease', ...style,
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: isDark ? 2 : 18, width: 20, height: 20,
          borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, color: 'var(--bg-primary)',
          transition: 'left 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <i className={`ti ti-${isDark ? 'moon' : 'sun'}`} />
      </span>
    </button>
  );
}
