import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addFoodLog } from '../lib/db';
import { pendingCount, syncQueue, isOffline } from '../lib/offlineQueue';
import { showAppToast } from '../lib/appToast';
import { useNavigate } from 'react-router-dom';
import { requestTourReplay } from '../lib/tour';

const btn = { flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--card-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 15, cursor: 'pointer' };

export default function SyncCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingCount());

  async function sync() {
    if (isOffline()) { showAppToast("You're offline — it will sync when you're back online", true); return; }
    setBusy(true);
    const { synced, remaining } = await syncQueue(addFoodLog, user?.id);
    setPending(remaining);
    setBusy(false);
    showAppToast(synced ? `Synced ${synced} item${synced === 1 ? '' : 's'}` : 'Everything is up to date', false);
    if (synced) setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div style={{ marginBottom: 20, display: 'flex', gap: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <button style={btn} onClick={sync} disabled={busy}>
        <i className="ti ti-refresh" /> {busy ? 'Syncing…' : `Sync now${pending ? ` (${pending})` : ''}`}
      </button>
      <button style={btn} onClick={() => { requestTourReplay(); navigate('/dashboard'); }}>
        <i className="ti ti-help-circle" /> Replay tour
      </button>
    </div>
  );
}
