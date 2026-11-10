import { useEffect, useState } from 'react';
import { setClientTargets, setClientMicroTargets, setClientDayTargets } from '../../lib/db';
import { useAuth } from '../../hooks/useAuth';
import { adherenceScore, adherenceTone } from '../../lib/clientInsights';
import { useClientDashboard } from './useClientDashboard';
import PageHeader from '../PageHeader';
import { GOAL_LABELS } from './constants';
import SnapshotTab from './SnapshotTab';
import DiaryTab from './DiaryTab';
import ProgressTab from './ProgressTab';
import PlanTab from './PlanTab';
import MessagesTab from './MessagesTab';
import ClientActionsMenu from './ClientActionsMenu';

const TONE_COLOR = { good: 'var(--accent-secondary)', fair: 'var(--gold)', low: 'var(--danger)', none: 'var(--text-hint)' };
const ADHERENCE_HELP = 'Logging consistency and target hits over the last 7 days';

// `readOnly` is the team owner's view of a teammate's client: the same data, no
// editing, and no messages (those stay between the coach and their client).
const SECTIONS = [
  { id: 'diary', label: 'Diary', icon: 'ti-clipboard-list', hint: 'What they logged, day by day' },
  { id: 'progress', label: 'Progress', icon: 'ti-chart-line', hint: 'Weight, trends and reports' },
  { id: 'plan', label: 'Plan', icon: 'ti-tools-kitchen-2', hint: 'Meal plans for the week' },
  { id: 'messages', label: 'Messages', icon: 'ti-message-circle', hint: 'Chat with your client' },
  { id: 'notes', label: 'Private notes', icon: 'ti-lock', hint: 'Only you can see these' },
];
const READ_ONLY_SECTIONS = ['diary', 'progress'];

// `section` comes from the URL: the client's home (Snapshot) is the default and
// each of Diary, Progress, Plan and Messages is a page of its own, reached from
// the list at the bottom of the home page.
export default function ClientDetail({ client, summary, row, onSetGroup, onRevoke, section = 'snapshot', onSection, onMessagesViewed, readOnly = false, coachName = null, onBack, backLabel = 'All clients', unreadCount = 0 }) {
  const { user } = useAuth();
  const allowed = readOnly ? READ_ONLY_SECTIONS : SECTIONS.map(x => x.id);
  const current = allowed.includes(section) ? section : 'snapshot';
  const go = (id) => onSection?.(id);
  // A mutable local copy of the client's goal/target fields — resyncs from the
  // prop whenever a different client is selected, but otherwise holds whatever
  // the trainer just saved so the page reflects it without refetching the list.
  const [clientData, setClientData] = useState(client);
  const [editingTargets, setEditingTargets] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [reportsOpen, setReportsOpen] = useState(section === 'reports');
  useEffect(() => { setClientData(client); setEditingTargets(false); }, [client]);
  // Reset only for a *different* client — a refetch that hands us a fresh
  // object for the same one must not throw the coach out of what they're doing.
  useEffect(() => {
    setMessageDraft('');
    setReportsOpen(false);
  }, [client.id]);

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

  const openMessages = (draft = '') => { setMessageDraft(draft); go('messages'); };
  const exportReport = () => { setReportsOpen(true); go('progress'); setTimeout(() => document.getElementById('client-report-builder')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50); };

  const d = useClientDashboard(client, clientData);
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);

  const subtitle = [GOAL_LABELS[clientData.goal], summary?.group_label, readOnly ? `View only${coachName ? ` · Coach: ${coachName}` : ''}` : null].filter(Boolean).join(' · ') || 'No goal set';

  // Diary, Progress, Plan and Messages: a page each, back to the client's home.
  if (current !== 'snapshot') {
    const meta = SECTIONS.find(x => x.id === current);
    return (
      <>
        <PageHeader title={meta.label} subtitle={clientData.name || 'Client'} onBack={() => go('snapshot')} backLabel={`Back to ${clientData.name || 'client'}`} />
        <div className="page-pad">
          {current === 'diary' && <DiaryTab d={d} />}
          {current === 'progress' && <ProgressTab client={client} clientData={clientData} d={d} reportsOpen={reportsOpen} onReportsOpenChange={setReportsOpen} />}
          {current === 'plan' && <PlanTab client={client} clientData={clientData} />}
          {current === 'messages' && <MessagesTab client={client} clientData={clientData} d={d} onViewed={onMessagesViewed} initialDraft={messageDraft} view="thread" />}
          {current === 'notes' && <MessagesTab client={client} clientData={clientData} d={d} view="notes" />}
        </div>
      </>
    );
  }

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
        <SnapshotTab readOnly={readOnly} clientData={clientData} d={d} summary={summary} editingTargets={editingTargets} setEditingTargets={setEditingTargets} onSaveTargets={handleSaveTargets} onSaveMicroTargets={handleSaveMicroTargets} onMessage={openMessages} />
        <nav aria-label="Client sections" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
          {SECTIONS.filter(x => allowed.includes(x.id)).map(x => (
            <button
              key={x.id}
              type="button"
              className="btn-press"
              onClick={() => go(x.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '6px 16px', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 14, color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, textAlign: 'left', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              <i className={`ti ${x.icon}`} aria-hidden="true" style={{ fontSize: 18, color: 'var(--accent)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block' }}>{x.label}{x.id === 'messages' && unreadCount > 0 ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: 'var(--accent-secondary)' }}>{unreadCount} new</span> : null}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginTop: 1 }}>{x.hint}</span>
              </span>
              <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
