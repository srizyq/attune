import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { todayLocalDate, dateNDaysAgo } from '../lib/patterns';
import { toKg, fromKg } from '../lib/adaptiveTDEE';
import { round1 } from '../lib/format';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import FormRow from '../components/FormRow';
import WeightSparkline from '../components/WeightSparkline';

// Log weight — one page for the Dashboard's weight tile and Expenditure's
// "+ Log weight" button (it used to be a popup on one and an inline form on
// the other). `?date=` picks the day being logged (the Dashboard passes the
// day it's showing); it defaults to today.
export default function LogWeight() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { profile } = useProfile();
  const today = todayLocalDate();
  const requested = params.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : today;
  const unit = profile?.unit === 'imperial' ? 'lb' : 'kg';
  const { logs, latest, loading, logWeight } = useWeightLogs(dateNDaysAgo(89), today);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  // Back to wherever you came from; a direct visit falls back to the Dashboard.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'));

  const recent = [...logs]
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date))
    .slice(-10)
    .map(w => round1(fromKg(toKg(w.weight, w.unit), unit)));

  async function submit() {
    if (!value || saving) return;
    setSaving(true);
    setError(null);
    try {
      await logWeight(date, Number(value), unit);
      goBack();
    } catch (err) {
      console.error('Failed to log weight:', err);
      setError("Couldn't save — try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="dashboard" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Log weight" subtitle={date === today ? 'Today' : date} onBack={goBack} backLabel="Back" />
        <div className="page-pad">
          <Card style={{ padding: 20 }}>
            {recent.length >= 2 && (
              <div style={{ marginBottom: 16 }}>
                <WeightSparkline points={recent} color="var(--accent)" />
              </div>
            )}
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Last logged</div>
            <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
              {loading ? '…' : latest ? `${latest.weight}${latest.unit}` : '—'}
            </div>
            <FormRow>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                aria-label={`Weight (${unit})`}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                placeholder={`Weight (${unit})`}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none',
                }}
              />
              <FormRow.Button icon="ti-device-floppy" primary onClick={submit} disabled={!value || saving}>
                {saving ? '…' : 'Save'}
              </FormRow.Button>
            </FormRow>
            {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}
            <button
              onClick={() => navigate('/expenditure', { state: { scrollTo: 'weight' } })}
              style={{ width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: 13, cursor: 'pointer', marginTop: 8, fontFamily: 'inherit' }}
            >
              View trend
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
