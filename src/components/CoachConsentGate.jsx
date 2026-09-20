import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getMyTrainers, redeemCoachInviteCode, respondToCoachLink, revokeClientLink } from '../lib/db';
import { takePendingInvite } from '../lib/coachInvite';
import { useClosingTransition } from '../hooks/useClosingTransition';
import CoachConsentCard from './CoachConsentCard';

// Which user this browser session has already checked for connections
// awaiting an answer — the check is one small request, and there's no
// reason to repeat it on every page change (RequireAuth re-mounts this per
// route). Module-level on purpose: it resets with a full reload, which is
// exactly when a dismissed ("Later") notice should get another chance.
let checkedFor = null;

// Mounted once inside RequireAuth. Does two things:
//  1. Redeems an invite code that arrived via a /join/ link before the
//     person had an account (see JoinCoach) — every mount, since that's a
//     cheap localStorage read and the stash appears after the fact.
//  2. Once per session, checks for coach connections awaiting the client's
//     answer (a pending invitation, or a pre-consent connection needing its
//     one-time notice) and shows the consent card as a modal, wherever
//     they happen to be. /coach shows the same card inline, so it's skipped
//     there rather than shown twice.
export default function CoachConsentGate() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [links, setLinks] = useState([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const code = takePendingInvite();
      if (code) {
        try {
          await redeemCoachInviteCode(code);
          navigate('/coach', { replace: true });
        } catch (err) {
          navigate('/coach', { replace: true, state: { inviteError: err.message || "That invite couldn't be used." } });
        }
        return;
      }
      if (checkedFor === userId) return;
      checkedFor = userId;
      try {
        const all = await getMyTrainers(userId);
        const waiting = all.filter(t => t.status === 'pending' || (t.status === 'active' && !t.consented_at));
        if (mounted.current && waiting.length) setLinks(waiting);
      } catch (err) {
        console.error('Failed to check coach connections:', err);
      }
    })();
  }, [userId, navigate]);

  if (!links.length || location.pathname.startsWith('/coach')) return null;
  return <ConsentModal key={links[0].id} link={links[0]} remaining={links.length - 1} onDone={() => setLinks(prev => prev.slice(1))} />;
}

function ConsentModal({ link, remaining, onDone }) {
  const { closing, close } = useClosingTransition(onDone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isInvite = link.status === 'pending';

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      close();
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.');
      setBusy(false);
    }
  };

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ width: '100%', maxWidth: 440 }}>
        <CoachConsentCard
          link={link}
          variant={isInvite ? 'invite' : 'notice'}
          busy={busy}
          error={error}
          style={{ marginBottom: 8 }}
          onAccept={() => run(() => respondToCoachLink(link.id, true))}
          onDecline={() => run(() => (isInvite ? respondToCoachLink(link.id, false) : revokeClientLink(link.id)))}
        />
        <div style={{ textAlign: 'center' }}>
          <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {remaining > 0 ? `Decide later (${remaining} more waiting)` : 'Decide later'}
          </button>
        </div>
      </div>
    </div>
  );
}
