import { Card, SectionLabel } from './shared';
import { describeResponse, scaleTrend } from '../../lib/checkinForms';

// What a client has answered on their check-ins, newest first, plus the trend
// for each 1–10 question ("sleep: 4 → 5 → 7 → 8"). Answers are shown from the
// snapshot stored with each response, so they stay correct after the form is
// edited.
export default function CheckinResponses({ responses }) {
  const scaleLabels = [];
  for (const r of responses) for (const d of describeResponse(r)) if (d.type === 'scale' && !scaleLabels.includes(d.label)) scaleLabels.push(d.label);

  return (
    <Card style={{ marginBottom: 0 }}>
      <SectionLabel icon="ti-history">Check-in answers</SectionLabel>
      {responses.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No check-ins submitted yet.</p>
      ) : (
        <>
          {scaleLabels.length > 0 && responses.length > 1 && (
            <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border-default)' }}>
              {scaleLabels.map(label => {
                const trend = scaleTrend(responses, label);
                if (trend.length < 2) return null;
                return (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{trend.join(' → ')}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
            {responses.map(r => (
              <div key={r.id} style={{ padding: '12px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 8 }}>{new Date(r.created_at).toLocaleString()}</div>
                {describeResponse(r).map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere', maxWidth: '60%', whiteSpace: 'pre-wrap' }}>{d.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
