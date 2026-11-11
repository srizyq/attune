// src/pages/Coach.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useMyClients, useClientSummaries, useClientMessages, useTeamClients, useMyTrainers } from '../hooks/useCoach';
import { useTeam } from '../hooks/useTeam';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import ClientCoachHub from '../components/ClientCoachHub';
import CoachInvitePanel from '../components/CoachInvitePanel';
import PageLinks from '../components/PageLinks';
import ClientList from '../components/coach/ClientList';
import TeamCard from '../components/coach/TeamCard';
import ClientDetail from '../components/coach/ClientDetail';
import ClientMessagesInbox from '../components/coach/ClientMessagesInbox';
import CollapsibleSection from '../components/coach/CollapsibleSection';
import { needsAttention } from '../lib/clientInsights';
import { todayLocalDate } from '../lib/patterns';

function timeOfDayGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Coach() {
  const navigate = useNavigate();
  // Everything under /coach is a page of its own, read from the URL:
  //   /coach  ·  /coach/clients/:id[/:section]  ·  /coach/team[/:id[/:section]]  ·  /coach/my-coach
  const [area, areaId, areaSection] = (useParams()['*'] || '').split('/').filter(Boolean);
  const trainerTab = area === 'team' ? 'team' : area === 'my-coach' ? 'my-coach' : 'clients';
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
  const { unread, total: unreadTotal, markSeen } = useClientMessages({ enabled: !!profile?.coach_pass });
  const openClient = (client, section) => navigate(`/coach/clients/${client.id}${section ? `/${section}` : ''}`);
  // A trainer can *also* be someone else's client (a coach with their own
  // nutritionist, say) — this tab is how they reach that relationship's
  // notes/chat/targets without it being hidden behind their own trainer
  // dashboard, which is what the Coach tab otherwise shows exclusively.
  // Reaching your own coach is a link at the bottom (with a count if one is waiting
  // for an answer), not a switch above everything — most coaches have none.
  const { pending: pendingCoachLinks } = useMyTrainers();
  const [inviteOpen, setInviteOpen] = useState(false);

  // The owner of a team can read (not edit) their teammates' clients.
  const { team, loading: teamLoading } = useTeam();
  const isTeamOwner = !!team?.is_owner && (team.members?.length || 0) > 1;
  const teamClients = useTeamClients(today, isTeamOwner);
  const selectedTeamClient = areaId && trainerTab === 'team' ? teamClients.clients.find(r => r.client?.id === areaId)?.client || null : null;
  // If the team goes away (ownership ends) while this page is open, fall back.
  useEffect(() => { if (trainerTab === 'team' && !teamLoading && !isTeamOwner) navigate('/coach', { replace: true }); }, [trainerTab, teamLoading, isTeamOwner, navigate]);
  const selectedTeamCoach = selectedTeamClient ? teamClients.summaries.find(s => s.client_id === selectedTeamClient.id)?.coach_name || null : null;

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
  const unreadNote = unreadTotal > 0 ? ` · ${unreadTotal} new message${unreadTotal === 1 ? '' : 's'}` : '';
  const selectedClient = area === 'clients' && areaId ? clients.find(r => r.client?.id === areaId)?.client || null : null;
  const selectedSummary = selectedClient ? summaries.find(s => s.client_id === selectedClient.id) : undefined;
  const selectedRow = selectedClient ? clients.find(r => r.client?.id === selectedClient.id) : undefined;

  // Opening a client (or going back to the list) starts at the top, instead of
  // leaving the page scrolled with its first lines under the sticky title.
  const scrollRef = useRef(null);
  const selectedId = selectedClient?.id ?? null;
  const selectedTeamId = selectedTeamClient?.id ?? null;
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); }, [selectedId, selectedTeamId, trainerTab, areaSection]);

  const hasClients = clients.length > 0;
  const showInvite = () => {
    setInviteOpen(true);
    setTimeout(() => document.getElementById('invite-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
  };
  const invitePanel = <CoachInvitePanel hasClients={hasClients} />;
  const clientList = (
    <ClientList
      clients={clients}
      loading={clientsLoading || (summariesLoading && summariesSupported && summaries.length === 0 && clients.length > 0)}
      summaries={summaries}
      summariesSupported={summariesSupported}
      today={today}
      onSelect={(c) => openClient(c)}
      onMessage={(c) => openClient(c, 'messages')}
      onStatus={reportStatus}
      loggedTodayCount={loggedTodayCount}
      resolvedCount={resolvedStatuses.length}
      allLoggedToday={allLoggedToday}
      unread={unread}
    />
  );

  if (!profile) return null;

  // The line above the My clients | My coach switch — who needs a look today.
  const greetingLine = clients.length === 0
    ? `${timeOfDayGreeting()} — invite your first client below`
    : summariesSupported
    ? (summariesLoading
        ? `${timeOfDayGreeting()} — checking in on your clients…`
        : attentionCount === 0
        ? `${timeOfDayGreeting()} — everyone's on track${unreadNote}`
        : `${timeOfDayGreeting()} — ${attentionCount} of ${clients.length} clients need attention${unreadNote}`)
    : resolvedStatuses.length === 0
    ? `${timeOfDayGreeting()} — checking in on your clients…`
    : allLoggedToday
    ? `${timeOfDayGreeting()} — everyone's logged today`
    : `${timeOfDayGreeting()} — ${loggedTodayCount}/${clients.length} clients logged today`;

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="coach" initials={initials} />
      <div ref={scrollRef} className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* A client opens in a page of its own: it draws its own slim header (back,
            name, score, Messages, ⋯), so none of this page's header stacks above it. */}
        {isTrainer && trainerTab === 'clients' && selectedClient ? (
          <ClientDetail
            client={selectedClient}
            summary={selectedSummary}
            row={selectedRow}
            onSetGroup={setGroup}
            onRevoke={async (id) => { await revoke(id); navigate('/coach'); }}
            section={areaSection}
            onSection={(sec) => navigate(sec === 'snapshot' ? `/coach/clients/${selectedClient.id}` : `/coach/clients/${selectedClient.id}/${sec}`)}
            onMessagesViewed={markSeen}
            onBack={() => navigate('/coach')}
            unreadCount={unread.get(selectedClient.id)?.unread || 0}
          />
        ) : isTrainer && trainerTab === 'team' && selectedTeamClient ? (
          <ClientDetail
            key={selectedTeamClient.id}
            client={selectedTeamClient}
            summary={teamClients.summaries.find(s => s.client_id === selectedTeamClient.id)}
            readOnly
            coachName={selectedTeamCoach}
            section={areaSection}
            onSection={(sec) => navigate(sec === 'snapshot' ? `/coach/team/${selectedTeamClient.id}` : `/coach/team/${selectedTeamClient.id}/${sec}`)}
            onBack={() => navigate('/coach/team')}
            backLabel="All team clients"
          />
        ) : (
          <>
        <PageHeader
          title={trainerTab === 'team' ? 'Team clients' : trainerTab === 'my-coach' ? 'Your own coach' : 'Coach'}
          onBack={trainerTab === 'clients' ? undefined : () => navigate('/coach')}
          backLabel="Back to Coach"
          right={isTrainer && trainerTab === 'clients' && hasClients ? (
            <button type="button" className="app-icon-btn" onClick={showInvite} aria-label="Add a client"><i className="ti ti-user-plus" aria-hidden="true" /></button>
          ) : undefined}
        />
        <div className="page-pad">
          {trainerTab === 'clients' && <PageLinks links={[{ to: '/friends', icon: 'ti-users-group', label: 'Friends' }]} />}
          {isTrainer ? (
            <div style={{ marginBottom: 16 }}>
              {trainerTab === 'clients' && (
                <p style={{ margin: '0 2px 8px', fontSize: 13, lineHeight: 1.4, color: 'var(--text-muted)' }}>{greetingLine}</p>
              )}
            </div>
          ) : null}
          {!isTrainer ? (
            <ClientCoachHub />
          ) : trainerTab === 'my-coach' ? (
            <>
              <ClientCoachHub showUpsell={false} />
            </>
          ) : trainerTab === 'team' ? (
            <ClientList
              title="Team clients" showCoach hideUnread
              emptyText="Your teammates have no active clients yet."
              clients={teamClients.clients}
              loading={teamClients.loading}
              summaries={teamClients.summaries}
              summariesSupported={teamClients.supported}
              today={today}
              onSelect={(c) => navigate(`/coach/team/${c.id}`)}
            />
          ) : (
            <>
            <ClientMessagesInbox unread={unread} clients={clients} onOpen={(c) => openClient(c, 'messages')} />
            {/* The list is what a coach opens this page for, so on a phone (one
                column) it comes before the invite card once there are clients;
                with none yet, inviting is the job and comes first. */}
            <div className="grid-2" style={{ alignItems: 'start' }}>
              {hasClients ? (
                <>
                  {clientList}
                  <CollapsibleSection id="invite-section" title="Invite a client" icon="ti-user-plus" open={inviteOpen} onToggle={() => setInviteOpen(o => !o)}>{invitePanel}</CollapsibleSection>
                </>
              ) : <>{invitePanel}{clientList}</>}
            </div>
            <div style={{ marginTop: 20 }}><TeamCard /></div>
            {isTeamOwner && (
              <button
                type="button"
                onClick={() => navigate('/coach/team')}
                className="btn-press"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 52, padding: '0 20px', marginTop: 20, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 16, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-users-group" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                  Team clients
                </span>
                <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/coach/my-coach')}
              className="btn-press"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 52, padding: '0 20px', marginTop: 20, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 16, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-user-heart" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                Your own coach
                {pendingCoachLinks.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-secondary)' }}>{pendingCoachLinks.length} waiting</span>}
              </span>
              <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
            </button>

            </>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
