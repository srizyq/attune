import { initialsOf } from '../lib/friends';

// Initials in an accent ring.
export default function Avatar({ name, size = 38 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'var(--accent-bg)', border: '1.5px solid var(--accent)', color: 'var(--accent)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: Math.round(size * 0.34),
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
