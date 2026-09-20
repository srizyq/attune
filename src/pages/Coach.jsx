// src/pages/Coach.jsx
import { useState, useEffect, useCallback } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useMyClients, useClientSummaries } from '../hooks/useCoach';
import AppNav from '../components/AppNav';
import ClientCoachHub from '../components/ClientCoachHub';
import CoachInvitePanel from '../components/CoachInvitePanel';
import LogoMark from '../components/LogoMark';
import ClientList from '../components/coach/ClientList';
import ClientDetail from '../components/coach/ClientDetail';
import { needsAttention } from '../lib/clientInsights';
import { todayLocalDate } from '../lib/patterns';

function timeOfDayGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Coach() {
  const { profile } = useProfile();
  const { clients, loading: clientsLoading, revoke, setGroup, refetch: refetchClients } = useMyClients();
  const today = todayLocalDate();
  const { summaries, supported: summariesSupported, loading: summariesLoading, refetch: refetchSummaries } = useClientSummaries(today);

  // A client accepting an invite happens on their device — pick it up when
  // the trainer comes back to this tab instead of leaving a stale list.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      refetchClients({ silent: true });
      refetchSummaries({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetchClients, refetchSummaries]);
  const [selectedClient, setSelectedClient] = useState(null);
  // A trainer can *also* be someone else's client (a coach with their own
  // nutritionist, say) — this tab is how they reach that relationship's
  // notes/chat/targets without it being hidden behind their own trainer
  // dashboard, which is what the Coach tab otherwise shows exclusively.
  const [trainerTab, setTrainerTab] = useState('clients'); // 'clients' | 'my-coach'

  // Rows resolve their own "logged today" status independently (see
  // ClientPreviewRow) and report it up here for both the header greeting
  // and the list's own summary line — the list itself never reorders as
  // each one resolves, which would be distracting while a trainer is
  // actively looking at it.
  const [statusById, setStatusById] = useState({});
  const reportStatus = useCallback((id, status) => {
    setStatusById(prev => ({ ...prev, [id]: status }));
  }, []);
  const resolvedStatuses = Object.values(statusById);
  const loggedTodayCount = resolvedStatuses.filter(s => s.loggedToday).length;
  const allLoggedToday = clients.length > 0 && resolvedStatuses.length === clients.length && loggedTodayCount === clients.length;

  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const isTrainer = !!profile?.coach_pass;
  const attentionCount = summaries.filter(s => needsAttention(s, today)).length;
  const selectedSummary = selectedClient ? summaries.find(s => s.client_id === selectedClient.id) : undefined;

  if (!profile) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="coach" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={24} />
            <div>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {isTrainer && trainerTab === 'clients' ? 'Coach Mode' : 'Coach'}
              </h2>
              <p style={{ color: 'var(--text-hint)', fontSize: 13, margin: '2px 0 0' }}>
                {!isTrainer || trainerTab === 'my-coach' ? "Your trainer, notes, and coaching tools" : selectedClient ? (selectedClient.name || 'Client') : (
                  clients.length === 0
                    ? `${timeOfDayGreeting()} — invite your first client below`
                    : summariesSupported
                    ? (summariesLoading
                        ? `${timeOfDayGreeting()} — checking in on your clients…`
                        : attentionCount === 0
                        ? `${timeOfDayGreeting()} — everyone's on track`
                        : `${timeOfDayGreeting()} — ${attentionCount} of ${clients.length} clients need attention`)
                    : resolvedStatuses.length === 0
                    ? `${timeOfDayGreeting()} — checking in on your clients…`
                    : allLoggedToday
                    ? `${timeOfDayGreeting()} — everyone's logged today`
                    : `${timeOfDayGreeting()} — ${loggedTodayCount}/${clients.length} clients logged today`
                )}
              </p>
            </div>
          </div>
          {isTrainer && trainerTab === 'clients' && selectedClient ? (
            <button
              onClick={() => setSelectedClient(null)}
              className="btn-press"
              style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              ← All clients
            </button>
          ) : isTrainer ? (
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 9, padding: 3 }}>
              {[{ id: 'clients', label: 'My clients' }, { id: 'my-coach', label: 'My coach' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTrainerTab(t.id)}
                  className="btn-press"
                  style={{
                    padding: '7px 14px', borderRadius: 7, border: 'none',
                    background: trainerTab === t.id ? 'var(--accent-bg)' : 'transparent',
                    color: trainerTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="page-pad">
          {!isTrainer ? (
            <ClientCoachHub />
          ) : trainerTab === 'my-coach' ? (
            <ClientCoachHub showUpsell={false} />
          ) : !selectedClient ? (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <CoachInvitePanel hasClients={clients.length > 0} />
              <ClientList
                clients={clients}
                loading={clientsLoading || (summariesLoading && summariesSupported && summaries.length === 0 && clients.length > 0)}
                summaries={summaries}
                summariesSupported={summariesSupported}
                today={today}
                onSelect={setSelectedClient}
                onRevoke={revoke}
                onSetGroup={setGroup}
                onStatus={reportStatus}
                loggedTodayCount={loggedTodayCount}
                resolvedCount={resolvedStatuses.length}
                allLoggedToday={allLoggedToday}
              />
            </div>
          ) : (
            <ClientDetail client={selectedClient} summary={selectedSummary} />
          )}
        </div>
      </div>
    </div>
  );
}
