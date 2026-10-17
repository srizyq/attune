import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { exportMyData, exportFilename } from '../../lib/dataExport';
import { SettingsModal, Card, SectionLabel, FieldRow } from './primitives';

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
  const [state, setState] = useState(null); // null | 'loading' | { done, skipped } | error string

  async function handleExport() {
    setState('loading');
    try {
      const result = await exportMyData(user.id);
      downloadJSON(exportFilename(), result);
      setState({ done: true, skipped: result.skipped });
    } catch (err) {
      setState(err.message || "Couldn't export your data — try again.");
    }
  }

  const done = state && typeof state === 'object';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, maxWidth: 260 }}>
      <button
        onClick={handleExport}
        disabled={state === 'loading'}
        style={{
          padding: '9px 16px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
          borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600,
          cursor: state === 'loading' ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {state === 'loading' ? 'Preparing…' : done ? 'Downloaded ✓' : 'Export my data'}
      </button>
      {done && state.skipped.length > 0 && (
        <span role="status" style={{ color: 'var(--gold)', fontSize: 11, textAlign: 'right', lineHeight: 1.4 }}>
          Left out because they couldn't be read: {state.skipped.map((s) => `${s.section} (${s.reason})`).join('; ')}. The file lists them too.
        </span>
      )}
      {typeof state === 'string' && state !== 'loading' && (
        <span style={{ color: 'var(--danger)', fontSize: 11 }}>{state}</span>
      )}
    </div>
  );
}

export default function PrivacyModal({ onClose, closing, onImport }) {
  return (
    <SettingsModal title="Privacy" onClose={onClose} closing={closing}>
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Your data</SectionLabel>
        <FieldRow label="Export my data">
          <ExportDataButton />
        </FieldRow>
        {onImport && (
          <FieldRow label="Import from another app">
            <button
              onClick={onImport}
              style={{
                padding: '9px 16px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
                borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Import
            </button>
          </FieldRow>
        )}
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel>Legal</SectionLabel>
        <Link to="/privacy" style={{ textDecoration: 'none' }}>
          <FieldRow label="Privacy Policy">
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16 }} />
          </FieldRow>
        </Link>
        <Link to="/terms" style={{ textDecoration: 'none' }}>
          <FieldRow label="Terms of Service">
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16 }} />
          </FieldRow>
        </Link>
      </Card>
    </SettingsModal>
  );
}
