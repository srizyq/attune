import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Switch from '../components/friends/Switch';
import { Labeled } from '../components/scan/NutritionFields';
import { submitReport, friendlyReportError, MAX_LENGTH, MIN_LENGTH } from '../lib/reports';

const card = { background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)', padding: 18 };

// Settings → Report a problem.
export default function ReportProblem() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [message, setMessage] = useState('');
  const [contactOk, setContactOk] = useState(true);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const length = message.trim().length;
  const ready = length >= MIN_LENGTH && length <= MAX_LENGTH && !busy;

  async function send(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await submitReport({ message: message.trim(), contactOk, screenshot: file, userId: user.id });
      setSent(true);
    } catch (err) {
      console.error('Failed to send report:', err);
      setError(friendlyReportError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="settings" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Report a problem" onBack={() => navigate('/settings')} backLabel="Back to Settings" />
        <div className="page-pad" style={{ maxWidth: 560 }}>
          {sent ? (
            <div role="status" style={{ ...card, textAlign: 'center', padding: '28px 18px' }}>
              <div style={{ fontSize: 40, color: 'var(--accent)' }}><i className="ti ti-circle-check" aria-hidden="true" /></div>
              <div style={{ fontWeight: 800, fontSize: 20, margin: '6px 0 16px' }}>Thanks, we've got it</div>
              <button type="button" onClick={() => navigate('/settings')} style={{ minHeight: 46, padding: '0 22px', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          ) : (
            <form onSubmit={send} style={card}>
              <Labeled id="report-message" label="What went wrong?">
                <textarea
                  id="report-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={MAX_LENGTH}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                />
              </Labeled>
              <div style={{ margin: '14px 0 4px' }}>
                <Labeled id="report-shot" label="Screenshot (optional)">
                  <input id="report-shot" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ width: '100%', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-secondary)' }} />
                </Labeled>
              </div>
              <Switch id="report-contact" title="You can email me about this" checked={contactOk} onChange={setContactOk} />
              {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '4px 0 10px' }}>{error}</div>}
              <button type="submit" disabled={!ready} style={{ width: '100%', minHeight: 48, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.55 }}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
