import { useState } from 'react';
import { weekSummaryTiles } from '../../lib/weekTiles';
import { weeklySummary } from '../../lib/clientInsights';
import { Card, CardHeader, CardAction } from './shared';
import { WEIGHT_PLAN_STATUS } from './weightPlanCopy';

const TONE = { good: 'var(--accent-secondary)', fair: 'var(--gold)', low: 'var(--danger)', none: 'var(--text-primary)' };

// The client's last seven days as three numbers — how much they logged, how
// often they hit target, and where their weight is going against the plan. These
// are the same numbers the client list is built from, so the list and this
// screen can't disagree. "Copy summary" still gives the longer written version.
export default function WeekTiles({ summary, clientData, today }) {
  const [copied, setCopied] = useState(false);
  const unit = clientData?.unit === 'imperial' ? 'lb' : 'kg';
  const tiles = weekSummaryTiles(summary, { unit });
  if (!tiles) return null;
  const text = weeklySummary(summary, { today, name: clientData?.name, unit })?.text;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — nothing to fall back to, the numbers are on screen.
    }
  };

  return (
    <Card>
      <CardHeader icon="ti-calendar-week" action={text ? <CardAction onClick={copy} icon={copied ? 'ti-check' : 'ti-copy'}>{copied ? 'Copied' : 'Copy summary'}</CardAction> : undefined}>Last 7 days</CardHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tiles.map((t) => (
          <div key={t.id} data-testid={`tile-${t.id}`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 10px', minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: TONE[t.tone] || TONE.none, margin: '6px 0 2px', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{t.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{t.sub}</div>
            {t.status && <div style={{ fontSize: 11, fontWeight: 700, color: TONE[WEIGHT_PLAN_STATUS[t.status]?.tone] || TONE.none, marginTop: 4 }}>{WEIGHT_PLAN_STATUS[t.status]?.label}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
