import { initialsOf } from '../../lib/communityPosts';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';

// Initials in an accent ring — everyone starts with this; an uploaded photo
// (src) replaces the initials when there is one.
export default function Avatar({ name, src, path, size = 38 }) {
  const signed = useSignedPhotoUrl(src ? null : path);
  const shown = src || signed;
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
      {shown ? <img src={shown} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(name)}
    </span>
  );
}
