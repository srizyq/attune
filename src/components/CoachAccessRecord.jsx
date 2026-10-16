import { COACH_CAN_SEE, COACH_CAN_DO, COACH_REASSURANCE } from '../lib/coachAccess';
import { buildAccessRecord } from '../lib/coachAccessRecord';
import Card from './Card';

const heading = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' };

// A client's own record of their coaching relationship: when it started, what
// they agreed to, and what the coach has done to their numbers — plus exactly
// what the coach can see and do, from the same lists the consent screen used.
export default function CoachAccessRecord({ link, profile }) {
  const coach = link?.trainer?.name || 'Your coach';
  const events = buildAccessRecord({ link, profile, coachName: coach });
  return (
    <Card style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ ...heading, marginBottom: 14 }}>Access record</div>
      <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0 }}>
        {events.map((e) => (
          <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{e.text}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 12 }}>{e.dateLabel}</span>
          </li>
        ))}
      </ul>
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>What {coach} can see and do</summary>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0' }}>Can see</div>
          <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{COACH_CAN_SEE.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0' }}>Can do</div>
          <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{COACH_CAN_DO.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>{COACH_REASSURANCE} Reports they've already downloaded stay with them.</p>
        </div>
      </details>
    </Card>
  );
}
