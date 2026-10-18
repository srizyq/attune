import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Toast from '../components/Toast';
import { isAppAdmin, listReports, updateReport, askClaudeToFix, screenshotUrl, STATUSES } from '../lib/reports';

const card = { background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)', padding: 16, marginBottom: 12 };
const when = (iso) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Screenshot({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    screenshotUrl(path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Screenshot from the report" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid var(--border-default)', marginTop: 10 }} /></a>;
}

function ReportCard({ report, onChange, onToast }) {
  const [note, setNote] = useState(report.admin_note || '');
  const [busy, setBusy] = useState(false);

  async function save(fields) {
    try { onChange(await updateReport(report.id, fields)); } catch (err) { console.error('Failed to update report:', err); onToast('Couldn\'t save that', true); }
  }
  async function claude() {
    setBusy(true);
    try { await askClaudeToFix(report.id); onChange({ ...report, status: 'claude_working', claude_requested_at: new Date().toISOString() }); onToast('Claude has been asked to draft a fix'); }
    catch { onToast('Couldn\'t start Claude', true); }
    finally { setBusy(false); }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, overflowWrap: 'anywhere' }}>
        {when(report.created_at)} · {report.screen || 'unknown screen'} · {report.app_version || 'unknown version'}{report.contact_email ? ` · ${report.contact_email}` : ''}
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.message}</p>
      {report.screenshot_path && <Screenshot path={report.screenshot_path} />}
      {(report.errors?.length > 0 || report.user_agent) && (
        <details style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <summary style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>Details</summary>
          <div style={{ overflowWrap: 'anywhere' }}>{report.user_agent} · {report.viewport}</div>
          {report.errors?.map((e, i) => <div key={i} style={{ marginTop: 4, overflowWrap: 'anywhere', fontFamily: 'monospace' }}>{e}</div>)}
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <select aria-label="Status" value={report.status} onChange={(e) => save({ status: e.target.value })} style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, padding: '0 10px' }}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {!report.claude_requested_at && (
          <button type="button" onClick={claude} disabled={busy} style={{ minHeight: 44, padding: '0 16px', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Asking…' : 'Ask Claude to fix'}
          </button>
        )}
        {report.github_issue_url && <a href={report.github_issue_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>GitHub issue</a>}
        {report.pr_url && <a href={report.pr_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Pull request</a>}
      </div>
      <textarea
        aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (note !== (report.admin_note || '')) save({ admin_note: note || null }); }}
        rows={2} style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
      />
    </div>
  );
}

// /admin/reports — every problem report, for the people on the admin list.
export default function AdminReports() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [admin, setAdmin] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  useEffect(() => { isAppAdmin().then(setAdmin); }, []);
  const load = useCallback(async () => {
    try { setReports(await listReports()); } catch (err) { console.error('Failed to load reports:', err); showToast('Couldn\'t load reports', true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (admin) load(); }, [admin, load]);

  if (admin === false) return <Navigate to="/settings" replace />;
  const closed = new Set(['fixed', 'wont_fix', 'duplicate']);
  const shown = reports.filter((r) => (filter === 'open' ? !closed.has(r.status) : closed.has(r.status)));

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="settings" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Reports" onBack={() => navigate('/settings')} backLabel="Back to Settings" />
        <div className="page-pad" style={{ maxWidth: 720 }}>
          <div role="tablist" aria-label="Report filter" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[['open', 'Open'], ['closed', 'Closed']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} style={{ minHeight: 40, padding: '0 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, background: filter === id ? 'var(--accent)' : 'var(--chip-bg)', color: filter === id ? 'var(--accent-contrast)' : 'var(--text-secondary)' }}>{label}</button>
            ))}
          </div>
          {admin === null || loading ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
            : shown.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No {filter} reports.</p>
            : shown.map((r) => <ReportCard key={r.id} report={r} onToast={showToast} onChange={(next) => setReports((rows) => rows.map((x) => (x.id === next.id ? next : x)))} />)}
        </div>
      </div>
      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
