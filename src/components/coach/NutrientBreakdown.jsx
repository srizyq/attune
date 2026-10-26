import { useState } from 'react';
import { Card, CardHeader, CardAction } from './shared';
import { MICRO_GROUPS } from './constants';
import { MICRO_NUTRIENTS, extendedNote, formatMicro } from '../../lib/microNutrients';
import { nutrientGaps, describeGaps } from '../../lib/nutrientGaps';

function Row({ n, value, target, noData }) {
  const effective = target || n.defaultTarget;
  const pct = effective && !noData ? (value / effective) * 100 : null;
  const over = pct != null && pct > 100;
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-default)' }} data-testid={`nutrient-${n.key}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 0, overflowWrap: 'anywhere' }}>{n.label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
          {noData ? '—' : <>{value}<span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 12 }}>{n.unit}{effective ? ` / ${effective}${n.unit}` : ''}</span></>}
        </span>
      </div>
      {pct != null && (
        <div style={{ height: 4, background: 'var(--border-default)', borderRadius: 99, marginTop: 6 }}>
          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: over && n.guideline.match(/under|up to/i) ? 'var(--danger)' : n.color, borderRadius: 99 }} />
        </div>
      )}
      {effective == null && !noData && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>{n.guideline}</div>}
    </div>
  );
}

// A day's nutrients for the coach: a two-line summary of what stands out
// (what's low, what's over its limit), and the full list one tap away. Thirty
// cards of mostly-fine numbers used to be four phone screens of scrolling.
export default function NutrientBreakdown({ date, foodLoading, hasAnyFood, microTotals, microTargets, extendedInfo }) {
  const [open, setOpen] = useState(false);
  const gaps = hasAnyFood ? nutrientGaps(microTotals, microTargets, extendedInfo) : null;

  return (
    <Card style={{ marginBottom: 0 }}>
      <CardHeader icon="ti-apple" action={hasAnyFood && !foodLoading ? <CardAction onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : `Show all ${MICRO_NUTRIENTS.length}`}</CardAction> : undefined}>Nutrients — {date}</CardHeader>
      {foodLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : !hasAnyFood ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nothing logged this day.</p>
      ) : (
        <>
          <div data-testid="nutrient-summary" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.5 }}>
            {gaps.low.length > 0 && <div><span style={{ color: 'var(--text-muted)' }}>Low: </span><span style={{ color: 'var(--gold)', fontWeight: 700 }}>{describeGaps(gaps.low)}</span></div>}
            {gaps.high.length > 0 && <div><span style={{ color: 'var(--text-muted)' }}>Over the limit: </span><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{describeGaps(gaps.high)}</span></div>}
            {gaps.low.length === 0 && gaps.high.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Nothing stands out against the guidelines.</div>}
          </div>
          {open && (
            <div style={{ marginTop: 16 }}>
              {MICRO_GROUPS.map((group) => (
                <div key={group.label} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: group.extended ? 4 : 0 }}>{group.label}</div>
                  {group.extended && extendedNote(extendedInfo) && <p style={{ fontSize: 11, color: 'var(--text-hint)', margin: '0 0 4px', lineHeight: 1.5 }}>{extendedNote(extendedInfo)}</p>}
                  {group.keys.map((key) => {
                    const n = MICRO_NUTRIENTS.find((m) => m.key === key);
                    // None of the day's foods carried it: a dash, not a misleading 0.
                    const noData = !!n.extended && extendedInfo?.withData === 0;
                    return <Row key={key} n={n} value={formatMicro(n, microTotals[key])} target={microTargets?.[key]} noData={noData} />;
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
