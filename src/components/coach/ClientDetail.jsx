import { useEffect, useRef, useState } from 'react';
import { setClientTargets, setClientMicroTargets, setClientDayTargets } from '../../lib/db';
import { useAuth } from '../../hooks/useAuth';
import { adherenceScore, adherenceTone } from '../../lib/clientInsights';
import { useClientDashboard } from './useClientDashboard';
import PageHeader from '../PageHeader';
import { GOAL_LABELS, TABS } from './constants';
import SnapshotTab from './SnapshotTab';
import DiaryTab from './DiaryTab';
import ProgressTab from './ProgressTab';
import PlanTab from './PlanTab';
import MessagesSheet from './MessagesSheet';
import ClientActionsMenu from './ClientActionsMenu';

const TONE_COLOR = { good: 'var(--accent-secondary)', fair: 'var(--gold)', low: 'var(--danger)', none: 'var(--text-hint)' };
const ADHERENCE_HELP = 'Logging consistency and target hits over the last 7 days';

// `readOnly` is the team owner's view of a teammate's client: the same data, no
// editing, and no messages (those stay between the coach and their client).
const READ_ONLY_TABS = ['snapshot', 'diary', 'progress'];

// The ids older links and callers used: Overview became Snapshot, and Messages
// and Reports are no longer tabs (a sheet, and a section of Progress).
const tabFor = (id, readOnly) => {
  const known = { overview: 'snapshot', messages: 'snapshot', reports: 'progress' }[id] || id;
  const allowed = readOnly ? READ_ONLY_TABS : TABS.map(t => t.id);
  return allowed.includes(known) ? known : 'snapshot';
};

// One client. The header is a single slim row (back, name, score, Messages, ⋯)
// so the data starts at the top of the screen; below it are four tabs that all
// fit on a phone. It renders its own page header, so the page around it must
// not render one.
export default function ClientDetail({ client, summary, row, onSetGroup, onRevoke, initialTab = 'snapshot', onMessagesViewed, readOnly = false, coachName = null, onBack, backLabel = 'All clients', unreadCount = 0 }) {
  const tabs = readOnly ? TABS.filter(t => READ_ONLY_TABS.includes(t.id)) : TABS;
  const { user } = useAuth();
  // A mutable local copy of the client's goal/target fields — resyncs from the
  // prop whenever a different client is selected, but otherwise holds whatever
  // the trainer just saved so the page reflects it without refetching the list.
  const [clientData, setClientData] = useState(client);
  const [editingTargets, setEditingTargets] = useState(false);
  const [tab, setTab] = useState(tabFor(initialTab, readOnly));
  const [messagesOpen, setMessagesOpen] = useState(!readOnly && initialTab === 'messages');
  const [messageDraft, setMessageDraft] = useState('');
  const [reportsOpen, setReportsOpen] = useState(initialTab === 'reports');
  const tabRefs = useRef({});
  useEffect(() => { setClientData(client); setEditingTargets(false); }, [client]);
  // Back to the start only for a *different* client — a refetch that hands us a
  // fresh object for the same one must not throw the coach out of the tab
  // they're working in.
  useEffect(() => {
    setTab(tabFor(initialTab, readOnly));
    setMessagesOpen(!readOnly && initialTab === 'messages');
    setMessageDraft('');
    setReportsOpen(initialTab === 'reports');
  }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected tab in view (optional-called: jsdom, and old browsers, lack scrollIntoView).
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const handleSaveTargets = async (fields, day) => {
    await setClientTargets(client.id, fields);
    // The database now records this coach as the owner of the numbers (and clears
    // any "client took them over" mark) — mirror that so the page is right without a refetch.
    setClientData(prev => ({ ...prev, ...fields, targets_set_by: user?.id ?? prev.targets_set_by, targets_set_at: new Date().toISOString(), targets_overridden_at: null }));
    // Rest-day targets are a separate call and only made when they changed.
    if (day) {
      await setClientDayTargets(client.id, day.rest, day.trainingDays);
      setClientData(prev => ({ ...prev, rest_day_targets: day.rest, training_days: day.trainingDays }));
    }
    setEditingTargets(false);
  };

  const handleSaveMicroTargets = async (targets) => {
    await setClientMicroTargets(client.id, targets);
    setClientData(prev => ({ ...prev, micro_targets: targets }));
  };

  const openMessages = (draft = '') => { setMessageDraft(draft); setMessagesOpen(true); };
  const exportReport = () => { setTab('progress'); setReportsOpen(true); setTimeout(() => document.getElementById('client-report-builder')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50); };

  const d = useClientDashboard(client, clientData);
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);

  // WAI-ARIA tabs: arrows move between tabs, Home/End jump to the ends.
  const onKeyDown = (e) => {
    const idx = tabs.findIndex(t => t.id === tab);
    const next = { ArrowRight: (idx + 1) % tabs.length, ArrowLeft: (idx - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  const subtitle = [GOAL_LABELS[clientData.goal], summary?.group_label, readOnly ? `View only${coachName ? ` · Coach: ${coachName}` : ''}` : null].filter(Boolean).join(' · ') || 'No goal set';

  return (
    <>
      <PageHeader
        title={clientData.name || 'Client'}
        subtitle={subtitle}
        onBack={onBack}
        backLabel={backLabel}
        right={(
          <>
            {score != null && (
              <span role="img" title={ADHERENCE_HELP} aria-label={`7-day adherence ${score} percent`} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, color: TONE_COLOR[tone] }}>{score}%</span>
            )}
            {!readOnly && (
              <button type="button" className="app-icon-btn" onClick={() => openMessages()} aria-label={unreadCount > 0 ? `Messages, ${unreadCount} new` : 'Messages'} style={{ position: 'relative' }}>
                <i className="ti ti-message-circle" aria-hidden="true" />
                {unreadCount > 0 && <span data-testid="messages-unread-dot" aria-hidden="true" style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent-secondary)', border: '2px solid var(--bg-card)', boxSizing: 'content-box' }} />}
              </button>
            )}
            <ClientActionsMenu row={row} onSetGroup={onSetGroup} onRevoke={onRevoke} onExport={exportReport} readOnly={readOnly} />
          </>
        )}
      />
      <div className="page-pad">
        <div
          role="tablist"
          aria-label="Client sections"
          onKeyDown={onKeyDown}
          style={{ display: 'flex', gap: 4, overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid var(--border-default)', marginBottom: 20, scrollbarWidth: 'none' }}
        >
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                ref={el => { tabRefs.current[t.id] = el; }}
                role="tab"
                id={`client-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`client-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                style={{
                  flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', background: 'none', border: 'none', minWidth: 0,
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, minHeight: 44,
                  color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`client-panel-${tab}`} aria-labelledby={`client-tab-${tab}`}>
          {tab === 'snapshot' && (
            <SnapshotTab readOnly={readOnly} clientData={clientData} d={d} summary={summary} editingTargets={editingTargets} setEditingTargets={setEditingTargets} onSaveTargets={handleSaveTargets} onSaveMicroTargets={handleSaveMicroTargets} onMessage={openMessages} />
          )}
          {tab === 'diary' && <DiaryTab d={d} />}
          {tab === 'progress' && <ProgressTab client={client} clientData={clientData} d={d} reportsOpen={reportsOpen} onReportsOpenChange={setReportsOpen} />}
          {tab === 'plan' && <PlanTab client={client} clientData={clientData} />}
        </div>
      </div>
      {messagesOpen && !readOnly && (
        <MessagesSheet client={client} clientData={clientData} d={d} draft={messageDraft} onClose={() => setMessagesOpen(false)} onViewed={onMessagesViewed} />
      )}
    </>
  );
}
