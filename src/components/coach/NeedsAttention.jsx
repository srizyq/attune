import { attentionFlags, weightPlan } from '../../lib/clientInsights';
import { nudgeFor } from '../../lib/coachNudges';
import { WEIGHT_PLAN_STATUS } from './weightPlanCopy';
import { Card } from './shared';

const SEVERITY_COLOR = { high: 'var(--danger)', medium: 'var(--gold)' };
// Reasons where changing the targets (not just talking) is a sensible next step.
const TARGET_REASONS = new Set(['off-target', 'weight-stalled', 'weight-wrong-way', 'weight-drifting', 'targets-changed']);

const btn = (primary) => ({
  flex: '1 1 140px', minHeight: 44, padding: '0 16px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: primary ? 'var(--accent)' : 'transparent', color: primary ? 'var(--accent-contrast)' : 'var(--text-secondary)',
  border: primary ? 'none' : '1px solid var(--border-strong)',
});

// Everything that needs the coach, in ONE place at the top of the client — each
// reason once (it used to appear as a chip, again in a weekly summary and again
// in its own card) — with the two things a coach does about it: message them,
// or change their targets. The message is a draft that lands in the message box
// to be read and edited; nothing is sent from here.
export default function NeedsAttention({ summary, today, clientName, onMessage, onAdjustTargets, readOnly = false }) {
  const flags = attentionFlags(summary, today);
  if (flags.length === 0) return null;
  const first = String(clientName || '').trim().split(/\s+/)[0] || 'client';
  const plan = weightPlan(summary);
  const weightFlag = flags.find((f) => f.id.startsWith('weight-'));
  const note = weightFlag && plan ? WEIGHT_PLAN_STATUS[plan.status]?.note : null;
  const wantsTargets = flags.some((f) => TARGET_REASONS.has(f.id));
  const worst = flags[0].severity;

  return (
    <Card role="status" aria-label="Needs attention" style={{ border: `1px solid color-mix(in srgb, ${SEVERITY_COLOR[worst]} 45%, var(--card-border))` }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: SEVERITY_COLOR[worst], marginBottom: 10 }}>
        Needs attention{flags.length > 1 ? ` · ${flags.length}` : ''}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flags.map((f) => (
          <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 600 }}>
            <i className="ti ti-alert-circle" aria-hidden="true" style={{ fontSize: 16, marginTop: 2, color: SEVERITY_COLOR[f.severity], flexShrink: 0 }} />
            <span style={{ overflowWrap: 'anywhere' }}>{f.label}</span>
          </li>
        ))}
      </ul>
      {note && <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>{note}</p>}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" className="btn-press" style={btn(true)} onClick={() => onMessage(nudgeFor(flags[0].id, clientName))}>
            Message {first}
          </button>
          {wantsTargets && onAdjustTargets && (
            <button type="button" className="btn-press" style={btn(false)} onClick={onAdjustTargets}>Adjust targets</button>
          )}
        </div>
      )}
    </Card>
  );
}
