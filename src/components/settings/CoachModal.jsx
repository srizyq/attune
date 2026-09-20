import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useMyTrainers } from '../../hooks/useCoach';
import { uploadCoachLogo } from '../../lib/db';
import { authedPost } from '../../lib/billing';
import { coachPassHint, eligibleForCoachTrial, COACH_TRIAL_DAYS } from '../../lib/coachPass';
import { SettingsModal, Card, SectionLabel, FieldRow } from './primitives';

function CoachPassButton({ profile, pendingConfirmation, onGoToProfile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = profile?.coach_pass
        ? await authedPost('/api/create-portal-session')
        : await authedPost('/api/create-checkout-session', { plan: 'coach' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Signup is already real at this point (RequireAuth's isUnsignedGuest
  // gate is the only thing standing between "browsing" and "has an
  // account" now) but unconfirmed — a subscription started now would
  // still be tied to a session that depends on that confirmation
  // completing. Send them to confirm it first instead of letting the
  // click reach checkout and bounce off the server-side block.
  if (pendingConfirmation && !profile?.coach_pass) {
    return (
      <button
        onClick={onGoToProfile}
        style={{
          padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)',
          borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        Confirm your email to subscribe
      </button>
    );
  }

  // coach_pass true with no stripe_subscription_id means there's no real
  // subscription behind it — a comp grant (compGrants.js), not a paid
  // one. "Manage billing" would just dead-end on create-portal-session's
  // "No billing account found yet" error, so it's a plain badge instead
  // of a button that goes nowhere.
  if (profile?.coach_pass && !profile?.stripe_subscription_id) {
    return <span style={{ color: 'var(--text-hint)', fontSize: 12, textAlign: 'right', maxWidth: 160 }}>Comp access — no billing to manage</span>;
  }

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
          fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {loading ? 'Loading…' : profile?.coach_pass ? 'Manage billing' : eligibleForCoachTrial(profile) ? 'Start free trial' : 'Subscribe'}
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
      <label style={{ padding: '7px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {uploading ? 'Uploading…' : profile?.coach_logo_url ? 'Change' : 'Upload'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
      </label>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

export default function CoachModal({ onClose, closing }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  // RequireAuth's isUnsignedGuest gate means is_anonymous here can only
  // mean "signed up, hasn't confirmed their email yet".
  const pendingConfirmation = !!user?.is_anonymous;

  const goToProfile = () => {
    onClose();
    navigate('/profile');
  };
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
          hint={eligibleForCoachTrial(profile) ? `Unlimited clients · ${COACH_TRIAL_DAYS}-day free trial` : coachPassHint(profile)}
        >
          <CoachPassButton profile={profile} pendingConfirmation={pendingConfirmation} onGoToProfile={goToProfile} />
        </FieldRow>
        <button
          onClick={() => navigate('/coach')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>Coach tab</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
              {profile?.coach_pass ? 'See your clients’ logged data and leave comments' : 'Your trainer, notes, and coaching tools'}
            </div>
          </div>
          <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16, flexShrink: 0 }} />
        </button>
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
          trainers.map(row => row.status === 'pending' ? (
            // The full "here's what they'll see" consent card lives on the
            // Coach tab — one place to accept, not a second, thinner copy here.
            <FieldRow key={row.id} label={`${row.trainer?.name || 'A coach'} invited you`} hint="Nothing is shared until you accept">
              <button
                onClick={() => { onClose(); navigate('/coach'); }}
                style={{ padding: '7px 12px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 7, color: '#0f0f0f', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Review
              </button>
            </FieldRow>
          ) : (
            <FieldRow key={row.id} label={row.trainer?.name || 'Trainer'} hint={`Connected ${new Date(row.created_at).toLocaleDateString()}`}>
              <button
                onClick={() => {
                  if (window.confirm(`Disconnect from ${row.trainer?.name || 'your coach'}? They'll lose access to your data immediately, and you'd need a new invite to reconnect.`)) disconnect(row.id);
                }}
                style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Disconnect
              </button>
            </FieldRow>
          ))
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={inviteCodeInput}
            onChange={e => { setInviteCodeInput(e.target.value); setInviteStatus(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleRedeemCode(); }}
            placeholder="Invite link or code"
            style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            onClick={handleRedeemCode}
            disabled={!inviteCodeInput.trim() || inviteStatus === 'loading'}
            style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
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
