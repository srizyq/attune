import { useState } from 'react';
import { Card, SectionLabel } from './shared';
import { weeklySummary } from '../../lib/clientInsights';

// The last seven days in a few plain lines, ready to read out or paste into
// a message. Plain text on purpose (see weeklySummary): no invented insight.
export default function WeeklySummaryCard({ summary, clientData, today }) {
  const [copied, setCopied] = useState(false);
  const result = weeklySummary(summary, { today, name: clientData.name, unit: clientData.unit === 'imperial' ? 'lb' : 'kg' });
  if (!result) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the lines are on screen to copy by hand.
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <SectionLabel icon="ti-calendar-week">This week</SectionLabel>
        <button onClick={copy} className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 18, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 12 }} /> {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        {result.lines.map(line => <li key={line}>{line}</li>)}
      </ul>
    </Card>
  );
}
