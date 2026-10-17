import { useState } from 'react';
import { Card, CardHeader, CardAction } from './shared';
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
      <CardHeader icon="ti-calendar-week" action={<CardAction onClick={copy} icon={copied ? 'ti-check' : 'ti-copy'}>{copied ? 'Copied' : 'Copy summary'}</CardAction>}>This week</CardHeader>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        {result.lines.map(line => <li key={line}>{line}</li>)}
      </ul>
    </Card>
  );
}
