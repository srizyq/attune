import { COACH_CAN_SEE, COACH_CAN_DO, COACH_REASSURANCE } from '../lib/coachAccess';

function initialsOf(name) {
  return (name || 'C').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'C';
}

function Bullets({ title, items }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>
      {items.map(item => (
        <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 7 }}>
          <i className={`ti ${item.icon}`} style={{ color: 'var(--accent)', fontSize: 15, marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// The client's consent moment. `invite` is a new connection awaiting their
// yes/no (the coach sees nothing until they accept); `notice` is the
// one-time "here's what your coach can access" for connections made before
// this step existed — same lists either way, from lib/coachAccess.js, so the
// screen can't drift from what a coach can actually do.
export default function CoachConsentCard({ link, variant = 'invite', busy = false, error = null, onAccept, onDecline, style }) {
  const trainer = link.trainer || {};
  const name = trainer.name || 'A coach';
  const isInvite = variant === 'invite';

  return (
    <div style={{
      background: 'linear-gradient(160deg, var(--accent-bg) 0%, var(--bg-subtle) 65%)',
      border: '1px solid var(--border-active)', borderRadius: 16, padding: 24, marginBottom: 20, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {trainer.coach_logo_url ? (
          <img src={trainer.coach_logo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-active)' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontFamily: "'Syne', sans-serif" }}>
            {initialsOf(name)}
          </div>
        )}
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isInvite ? `${name} invited you to be coached` : `${name} is your coach`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {isInvite
              ? 'Nothing is shared until you accept.'
              : 'You connected before we added this step, so here’s exactly what they can access.'}
          </div>
        </div>
      </div>

      <Bullets title={`${name} will be able to see`} items={COACH_CAN_SEE} />
      <Bullets title="And can" items={COACH_CAN_DO} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>{COACH_REASSURANCE}</p>

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onAccept}
          disabled={busy}
          className="btn-press"
          style={{ padding: '10px 20px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {busy ? 'Saving…' : isInvite ? 'Accept and connect' : 'Got it'}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="btn-press"
          style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: busy ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {isInvite ? 'Decline' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}
