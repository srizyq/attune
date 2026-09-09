import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import NotificationsModal from '../components/settings/NotificationsModal';
import CoachModal from '../components/settings/CoachModal';
import AccountModal from '../components/settings/AccountModal';

// Which "page" each section opens as — short sections (a couple of field
// rows) are quick to check and dismiss, so they open as a popup right
// over the list; Goals & Targets has real depth (goal, activity, calorie
// mode, two sliders, a micronutrient grid) and reads better with the
// room a full page gives it, matching how Nutrients/Profile/Expenditure
// already work as their own screens instead of a modal.
const SECTIONS = [
  { id: 'goals',   icon: 'ti-target',       label: 'Goals & Targets', kind: 'page' },
  { id: 'notifs',  icon: 'ti-bell',         label: 'Notifications',   kind: 'modal' },
  { id: 'coach',   icon: 'ti-users',        label: 'Coach Mode',      kind: 'modal' },
  { id: 'account', icon: 'ti-user-circle',  label: 'Account',         kind: 'modal' },
];

// One entry per individual setting (not per section) so a search like
// "protein" or "reminder" jumps straight to the right section instead of
// requiring you to already know which one it lives under.
const SEARCH_INDEX = [
  { section: 'goals', label: 'Weight goal', keywords: 'goal lose maintain build weight' },
  { section: 'goals', label: 'Activity level', keywords: 'activity sedentary light moderate active exercise' },
  { section: 'goals', label: 'Calorie target', keywords: 'calorie calories target kcal custom adaptive' },
  { section: 'goals', label: 'Macro split', keywords: 'macro protein fat carbs split' },
  { section: 'goals', label: 'Micronutrient targets', keywords: 'micronutrient vitamin mineral pro' },
  { section: 'notifs', label: 'Daily reminder', keywords: 'reminder notification nudge push time' },
  { section: 'notifs', label: 'Water reminders', keywords: 'water hydrate reminder' },
  { section: 'notifs', label: 'Daily mood check-in', keywords: 'mood check-in checkin' },
  { section: 'coach', label: 'Coach Pass', keywords: 'coach pass subscribe billing trainer' },
  { section: 'coach', label: 'Coach Mode', keywords: 'coach mode client dashboard' },
  { section: 'coach', label: 'My trainer', keywords: 'trainer invite code connect' },
  { section: 'account', label: 'Account status', keywords: 'account email guest sign in' },
  { section: 'account', label: 'Pro features', keywords: 'pro premium upgrade' },
  { section: 'account', label: 'Theme', keywords: 'theme dark light appearance' },
  { section: 'account', label: 'Log out', keywords: 'log out logout sign out exit guest' },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const [openModal, setOpenModal] = useState(null); // null | 'notifs' | 'coach' | 'account'
  const [modalClosing, setModalClosing] = useState(false);
  const [query, setQuery] = useState('');

  function closeModal() {
    setModalClosing(true);
    setTimeout(() => { setOpenModal(null); setModalClosing(false); }, 160);
  }

  function openSection(id) {
    const section = SECTIONS.find(s => s.id === id);
    if (!section) return;
    if (section.kind === 'page') navigate('/settings/goals');
    else setOpenModal(id);
  }

  // Returning from Stripe Checkout — the webhook updates the profile
  // server-side almost immediately, but this tab's own `profile` state
  // won't know until it refetches. A couple of retries covers the small
  // gap between the redirect landing and the webhook actually finishing.
  // Also pops the Coach Mode popup open so the new subscription is
  // actually visible instead of landing back on a plain section list.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('coach_pass') !== 'success') return;
    setOpenModal('coach');
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      refetchProfile();
      if (attempts >= 5) clearInterval(interval);
    }, 1500);
    navigate(location.pathname, { replace: true });
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return SEARCH_INDEX.filter(item => item.label.toLowerCase().includes(q) || item.keywords.includes(q));
  }, [query]);

  const isGuest = !!user?.is_anonymous;
  const pendingConfirmation = isGuest && !!user?.email;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;

  const goalLabels = { lose: 'Lose weight', maintain: 'Maintain', build: 'Build muscle' };
  const summaries = {
    goals: profile?.calorie_target ? `${profile.calorie_target.toLocaleString()} kcal · ${goalLabels[profile.goal] || 'Maintain'}` : 'Not set up yet',
    notifs: profile?.reminder_enabled ? `Daily reminder at ${profile.reminder_time || '19:00'}` : 'All reminders off',
    coach: profile?.coach_pass ? (profile?.coach_mode ? 'Coach Mode active' : 'Coach Pass active') : 'Not active',
    account: pendingConfirmation ? 'Pending email confirmation' : isGuest ? `Guest mode · ${daysRemaining} days left` : (user?.email || 'Signed in'),
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      <AppNav active="settings" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Settings
            </h2>
            <p style={{ color: 'var(--text-hint)', fontSize: '13px', margin: '2px 0 0' }}>Manage your goals, profile and preferences</p>
          </div>
        </div>

        <div className="page-pad">
          {/* Profile preview — stays at the top, tap through to the full
              Profile page. Unchanged position from before the redesign. */}
          <button
            onClick={() => navigate('/profile')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
              borderRadius: '14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              transition: 'border-color 0.15s', marginBottom: 20,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent-bg)', border: '1px solid var(--accent-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
              fontFamily: "'Syne', sans-serif",
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>{profile?.name || 'Your name'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>{summaries.account}</div>
            </div>
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16, flexShrink: 0 }} />
          </button>

          {/* Search — jumps straight to an individual setting instead of
              requiring you to already know which section it's under. */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-hint)', fontSize: 16 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search settings…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '13px 14px 13px 40px',
                background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12,
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {results ? (
            results.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No settings match "{query}"</p>
            ) : (
              <div style={{ marginBottom: 8 }}>
                {results.map(r => {
                  const section = SECTIONS.find(s => s.id === r.section);
                  return (
                    <button
                      key={r.label}
                      onClick={() => { setQuery(''); openSection(r.section); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10,
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', marginBottom: 8,
                      }}
                    >
                      <i className={`ti ${section.icon}`} style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{r.label}</div>
                        <div style={{ color: 'var(--text-hint)', fontSize: 11, marginTop: 1 }}>{section.label}</div>
                      </div>
                      <i className="ti ti-arrow-right" style={{ color: 'var(--text-hint)', fontSize: 14 }} />
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            /* Grouped list — every section title visible at once, no tabs
               to switch between and lose track of what else exists. */
            <div>
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => openSection(s.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 14,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', marginBottom: 10,
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>{s.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{summaries[s.id]}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16, flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* Required FatSecret Platform API attribution — must not be
              reworded per their attribution policy. Settings is the one
              screen every user always has access to, so it lives here now
              that the marketing Landing page (its previous home) is gone. */}
          <div style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 8 }}>
            <a href="https://platform.fatsecret.com" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              Powered by fatsecret Platform API
            </a>
            <div style={{ marginTop: 8 }}>
              <a href="/terms" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>Terms of Service</a>
              <span style={{ fontSize: 11, color: 'var(--text-hint)', margin: '0 8px' }}>·</span>
              <a href="/privacy" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>

      {openModal === 'notifs' && <NotificationsModal onClose={closeModal} closing={modalClosing} />}
      {openModal === 'coach' && <CoachModal onClose={closeModal} closing={modalClosing} />}
      {openModal === 'account' && <AccountModal onClose={closeModal} closing={modalClosing} />}
    </div>
  );
}
