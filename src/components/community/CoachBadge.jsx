// Small "Coach" tag shown next to an active coach's name.
export default function CoachBadge() {
  return (
    <span
      title="Coach"
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase' }}
    >
      Coach
    </span>
  );
}
