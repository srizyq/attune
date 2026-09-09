import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useMyTrainers } from '../../hooks/useCoach';
import { supabase } from '../../lib/supabase';
import { uploadCoachLogo } from '../../lib/db';
import { SettingsModal, Card, SectionLabel, FieldRow, Toggle } from './primitives';

async function authedPost(path) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong — try again.');
  return data;
}

function CoachPassButton({ profile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await authedPost(profile?.coach_pass ? '/api/create-portal-session' : '/api/create-checkout-session');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: '9px 16px',
          background: profile?.coach_pass ? 'transparent' : 'var(--accent)',
          border: `1px solid ${profile?.coach_pass ? 'var(--border-default)' : 'var(--accent)'}`,
          borderRadius: 8, color: profile?.coach_pass ? 'var(--text-secondary)' : '#0f0f0f',
          fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {loading ? 'Loading…' : profile?.coach_pass ? 'Manage billing' : 'Subscribe'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

function CoachLogoUpload({ profile, saveProfile }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadCoachLogo(user.id, file);
      await saveProfile({ coach_logo_url: url });
    } catch (err) {
      setError(err.message || "Couldn't upload — try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {profile?.coach_logo_url && (
        <img src={profile.coach_logo_url} alt="Your logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-default)' }} />
      )}
      <label style={{ padding: '7px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
        {uploading ? 'Uploading…' : profile?.coach_logo_url ? 'Change' : 'Upload'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
      </label>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

export default function CoachModal({ onClose, closing }) {
  const navigate = useNavigate();
  const { profile, save: saveProfile } = useProfile();
  const { trainers, loading: trainersLoading, redeemCode, disconnect } = useMyTrainers();
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);

  const handleRedeemCode = async () => {
    const code = inviteCodeInput.trim();
    if (!code) return;
    setInviteStatus('loading');
    try {
      await redeemCode(code);
      setInviteCodeInput('');
      setInviteStatus(null);
    } catch (err) {
      setInviteStatus(err.message || "Couldn't connect — check the code and try again.");
    }
  };

  return (
    <SettingsModal title="Coach Mode" onClose={onClose} closing={closing}>
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Become a coach</SectionLabel>
        <FieldRow
          label="Coach Pass"
          hint={profile?.coach_pass ? `Active subscription · ${profile?.coach_pass_status || 'active'}` : 'Unlimited clients'}
        >
          <CoachPassButton profile={profile} />
        </FieldRow>
        <FieldRow label="Coach Mode" hint={profile?.coach_pass ? 'See your clients’ logged data and leave comments' : 'Requires Coach Pass'}>
          <Toggle
            on={!!profile?.coach_mode}
            onChange={async (on) => {
              if (!profile?.coach_pass) return;
              await saveProfile({ coach_mode: on });
              navigate(on ? '/coach' : '/dashboard');
            }}
          />
        </FieldRow>
        {profile?.coach_mode && (
          <button
            onClick={() => navigate('/coach')}
            style={{ marginTop: 16, padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            Open Coach Dashboard
          </button>
        )}
        {profile?.coach_pass && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
            <FieldRow label="Your logo" hint="Shown to your clients wherever they see your name">
              <CoachLogoUpload profile={profile} saveProfile={saveProfile} />
            </FieldRow>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel>My trainer</SectionLabel>
        {trainersLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : trainers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>Not connected to a trainer yet.</p>
        ) : (
          trainers.map(row => (
            <FieldRow key={row.id} label={row.trainer?.name || 'Trainer'} hint={`Connected ${new Date(row.created_at).toLocaleDateString()}`}>
              <button
                onClick={() => disconnect(row.id)}
                style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                Disconnect
              </button>
            </FieldRow>
          ))
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={inviteCodeInput}
            onChange={e => { setInviteCodeInput(e.target.value.toUpperCase()); setInviteStatus(null); }}
            placeholder="Enter invite code"
            style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', textTransform: 'uppercase' }}
          />
          <button
            onClick={handleRedeemCode}
            disabled={!inviteCodeInput.trim() || inviteStatus === 'loading'}
            style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
          >
            {inviteStatus === 'loading' ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {inviteStatus && inviteStatus !== 'loading' && (
          <p style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{inviteStatus}</p>
        )}
      </Card>
    </SettingsModal>
  );
}
