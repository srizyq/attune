import { useEffect, useState } from 'react';
import { Card, SectionLabel } from './shared';
import { fieldStyle, labelStyle } from './constants';
import { DAY_FILTERS, MAX_REPORT_DAYS, buildCsv, buildReport, buildReportHtml, reportFilename, validateRange } from '../../lib/clientReport';
import { downloadTextFile, openPrintWindow } from '../../lib/download';
import { getCheckinsForRange, getFoodLogsForRange, getWeightLogsForRange, getWorkoutLogsForRange } from '../../lib/db';
import { dateNDaysAgo, todayLocalDate } from '../../lib/patterns';

const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'custom', label: 'Custom' },
];

const pill = (active) => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: active ? 'var(--accent-bg)' : 'var(--bg-card)',
  border: `1px solid ${active ? 'var(--accent-dark)' : 'var(--border-strong)'}`,
  color: active ? 'var(--accent)' : 'var(--text-muted)',
});
const actionBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// Build a report for any date range, then print / save it as a PDF or
// download it as a CSV for a spreadsheet or client file. Two steps on
// purpose: the (async) data load happens on "Generate", and print/download
// happen on their own click afterwards — a window opened after an `await`
// is blocked by popup blockers.
export default function ReportsTab({ client, clientData }) {
  const today = todayLocalDate();
  const [preset, setPreset] = useState('30');
  const [start, setStart] = useState(dateNDaysAgo(29));
  const [end, setEnd] = useState(today);
  const [dayFilter, setDayFilter] = useState('all');
  const [includeMicros, setIncludeMicros] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Any change to the settings makes a previously generated report stale.
  useEffect(() => { setReport(null); setStatus('idle'); setNotice(null); }, [start, end, dayFilter, includeMicros, client.id]);

  const choosePreset = (p) => {
    setPreset(p.id);
    if (p.days) { setStart(dateNDaysAgo(p.days - 1)); setEnd(today); }
  };

  const problem = validateRange(start, end) || (end > today ? 'The end date is in the future.' : null);

  const generate = async () => {
    if (problem) return;
    setStatus('loading');
    setError(null);
    try {
      const [foodLogs, checkins, weightLogs, workouts] = await Promise.all([
        getFoodLogsForRange(client.id, start, end),
        getCheckinsForRange(client.id, start, end),
        getWeightLogsForRange(client.id, start, end),
        getWorkoutLogsForRange(client.id, start, end),
      ]);
      setReport(buildReport({ client: clientData, start, end, dayFilter, foodLogs, checkins, weightLogs, workouts, includeMicros }));
      setStatus('ready');
    } catch (err) {
      console.error('Failed to build report:', err);
      setError(err.message || "Couldn't build the report — try again.");
      setStatus('error');
    }
  };

  const print = () => {
    setNotice(openPrintWindow(buildReportHtml(report)) ? null : 'Your browser blocked the report window — allow pop-ups for this site and try again.');
  };
  const download = () => downloadTextFile(reportFilename(report, 'csv'), buildCsv(report));

  const s = report?.summary;
  return (
    <Card style={{ marginBottom: 0 }}>
      <SectionLabel icon="ti-file-analytics">Report builder</SectionLabel>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} role="group" aria-label="Date range">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => choosePreset(p)} aria-pressed={preset === p.id} className="btn-press" style={pill(preset === p.id)}>{p.label}</button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="grid-2" style={{ marginBottom: 14, gap: 12 }}>
          <div>
            <label htmlFor="report-start" style={labelStyle}>From</label>
            <input id="report-start" type="date" value={start} max={end} onChange={e => setStart(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label htmlFor="report-end" style={labelStyle}>To</label>
            <input id="report-end" type="date" value={end} min={start} max={today} onChange={e => setEnd(e.target.value)} style={fieldStyle} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="report-filter" style={labelStyle}>Which days to include in the averages</label>
        <select id="report-filter" value={dayFilter} onChange={e => setDayFilter(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
          {DAY_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '6px 0 0' }}>{DAY_FILTERS.find(f => f.id === dayFilter)?.hint}</p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={includeMicros} onChange={e => setIncludeMicros(e.target.checked)} />
        Include micronutrient averages
      </label>

      {problem && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{problem}</p>}

      <button
        onClick={generate}
        disabled={!!problem || status === 'loading'}
        className="btn-press"
        style={{ padding: '10px 20px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: problem ? 'not-allowed' : 'pointer', opacity: problem ? 0.5 : 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {status === 'loading' ? 'Building…' : 'Generate report'}
      </button>
      <span style={{ color: 'var(--text-hint)', fontSize: 11, marginLeft: 10 }}>Up to {MAX_REPORT_DAYS} days</span>
      {status === 'error' && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}

      {status === 'ready' && s && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {clientData.name || 'Client'} · {start} to {end} · {s.includedDays} of {s.rangeDays} days included
          </div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Avg. calories" value={s.avgCalories.toLocaleString()} />
            <Stat label="Days logged" value={`${s.loggedDays}/${s.rangeDays}`} />
            <Stat label="Complete days" value={`${s.completeDays}/${s.rangeDays}`} />
            <Stat label="Weight" value={s.weight ? `${s.weight.change > 0 ? '+' : ''}${s.weight.change} ${s.weight.unit}` : '—'} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={print} className="btn-press" style={actionBtn}><i className="ti ti-printer" style={{ fontSize: 14 }} /> Print / save as PDF</button>
            <button onClick={download} className="btn-press" style={actionBtn}><i className="ti ti-download" style={{ fontSize: 14 }} /> Download CSV</button>
          </div>
          {notice && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{notice}</p>}
        </div>
      )}
    </Card>
  );
}
