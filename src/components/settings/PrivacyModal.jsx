import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getProfile, getFoodLogsForRange, getWeightLogsForRange, getCheckinsForRange } from '../../lib/db';
import { SettingsModal, Card, SectionLabel, FieldRow } from './primitives';

// Wide enough to cover anyone's real history without needing to know
// their actual signup date up front — Supabase's own row cap (1000 per
// query) is far more logged days than a personal export realistically
// needs to worry about.
const EXPORT_START_DATE = '2020-01-01';

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportDataButton() {
  const { user } = useAuth();
  const [state, setState] = useState(null); // null | 'loading' | 'done' | error string

  async function handleExport() {
    setState('loading');
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [profile, foodLogs, weightLogs, checkins] = await Promise.all([
        getProfile(user.id),
        getFoodLogsForRange(user.id, EXPORT_START_DATE, todayStr),
        getWeightLogsForRange(user.id, EXPORT_START_DATE, todayStr),
        getCheckinsForRange(user.id, EXPORT_START_DATE, todayStr),
      ]);
      downloadJSON(`attune-data-export-${todayStr}.json`, {
        exportedAt: new Date().toISOString(),
        profile,
        foodLogs,
        weightLogs,
        checkins,
      });
      setState('done');
    } catch (err) {
      setState(err.message || "Couldn't export your data — try again.");
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleExport}
        disabled={state === 'loading'}
        style={{
          padding: '9px 16px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
          borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600,
          cursor: state === 'loading' ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {state === 'loading' ? 'Preparing…' : state === 'done' ? 'Downloaded ✓' : 'Export my data'}
      </button>
      {state && state !== 'loading' && state !== 'done' && (
        <span style={{ color: 'var(--danger)', fontSize: 11 }}>{state}</span>
      )}
    </div>
  );
}

export default function PrivacyModal({ onClose, closing }) {
  return (
    <SettingsModal title="Privacy" onClose={onClose} closing={closing}>
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Your data</SectionLabel>
        <FieldRow label="Export my data" hint="Download everything you've logged — food, weight, mood check-ins — as a file">
          <ExportDataButton />
        </FieldRow>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel>Legal</SectionLabel>
        <Link to="/privacy" style={{ textDecoration: 'none' }}>
          <FieldRow label="Privacy Policy" hint="What we collect, why, and who it's shared with">
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16 }} />
          </FieldRow>
        </Link>
        <Link to="/terms" style={{ textDecoration: 'none' }}>
          <FieldRow label="Terms of Service" hint="The terms you agreed to when you signed up">
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16 }} />
          </FieldRow>
        </Link>
      </Card>
    </SettingsModal>
  );
}
