import { useEffect, useRef, useState } from 'react';
import { setClientTargets, setClientMicroTargets, setClientDayTargets } from '../../lib/db';
import { useAuth } from '../../hooks/useAuth';
import { adherenceScore, adherenceTone } from '../../lib/clientInsights';
import { useClientDashboard } from './useClientDashboard';
import { ClientAvatar, RowActions } from './shared';
import { GOAL_LABELS, TABS } from './constants';
import OverviewTab from './OverviewTab';
import DiaryTab from './DiaryTab';
import ProgressTab from './ProgressTab';
import MessagesTab from './MessagesTab';
import PlanTab from './PlanTab';
import ReportsTab from './ReportsTab';

const TONE_COLOR = { good: 'var(--accent)', fair: 'var(--gold)', low: 'var(--danger)', none: 'var(--text-hint)' };

// One client, split into six tabs so each stays short: the long single page
// this replaced mixed reading (charts, diary), writing (messages, notes) and
// output (reports) in one scroll.
// `readOnly` is the team owner's view of a teammate's client: the same data, no
// editing, and no messages (those stay between the coach and their client).
const READ_ONLY_TABS = ['overview', 'diary', 'progress', 'reports'];

export default function ClientDetail({ client, summary, row, onSetGroup, onRevoke, initialTab = 'overview', onMessagesViewed, readOnly = false, coachName = null }) {
  const tabs = readOnly ? TABS.filter(t => READ_ONLY_TABS.includes(t.id)) : TABS;
  const { user } = useAuth();
  // A mutable local copy of the client's goal/target fields — resyncs from the
  // prop whenever a different client is selected, but otherwise holds whatever
  // the trainer just saved so the page reflects it without refetching the list.
  const [clientData, setClientData] = useState(client);
  const [editingTargets, setEditingTargets] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const tabRefs = useRef({});
  useEffect(() => { setClientData(client); setEditingTargets(false); }, [client]);
  // Back to Overview only for a *different* client — a refetch that hands us a
  // fresh object for the same one must not throw the coach out of the tab
  // they're working in.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTab(initialTab); }, [client.id]);

  // On a phone the six tabs overflow and scroll sideways; keep the selected
  // one in view (optional-called: jsdom, and old browsers, lack scrollIntoView).
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

  const d = useClientDashboard(client, clientData);
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);
  const todayPct = summary?.calorie_target && summary.today_cal ? Number(summary.today_cal) / summary.calorie_target : 0;

  // WAI-ARIA tabs: arrows move between tabs, Home/End jump to the ends.
  const onKeyDown = (e) => {
    const idx = tabs.findIndex(t => t.id === tab);
    const next = { ArrowRight: (idx + 1) % tabs.length, ArrowLeft: (idx - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <ClientAvatar name={clientData.name} pct={todayPct} size={48} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{clientData.name || 'Client'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {[GOAL_LABELS[clientData.goal], summary?.group_label].filter(Boolean).join(' · ') || 'No goal set'}
          </div>
        </div>
        {score != null && (
          <div title="Logging consistency and target hits over the last 7 days" style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 700, color: TONE_COLOR[tone], lineHeight: 1 }}>{score}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>7-day adherence</div>
          </div>
        )}
      </div>
      {readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 99, background: 'var(--chip-bg)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
            <i className="ti ti-eye" aria-hidden="true" />{coachName ? `Coach: ${coachName} · ` : ''}View only
          </span>
        </div>
      )}
      {!readOnly && row && onSetGroup && onRevoke && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <RowActions row={row} onSetGroup={onSetGroup} onRevoke={onRevoke} />
        </div>
      )}

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
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'none', border: 'none', flexShrink: 0,
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, minHeight: 44,
                color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`client-panel-${tab}`} aria-labelledby={`client-tab-${tab}`}>
        {tab === 'overview' && (
          <OverviewTab readOnly={readOnly} clientData={clientData} d={d} summary={summary} editingTargets={editingTargets} setEditingTargets={setEditingTargets} onSaveTargets={handleSaveTargets} onSaveMicroTargets={handleSaveMicroTargets} />
        )}
        {tab === 'diary' && <DiaryTab d={d} />}
        {tab === 'progress' && <ProgressTab client={client} d={d} />}
        {tab === 'messages' && <MessagesTab client={client} clientData={clientData} d={d} onViewed={onMessagesViewed} />}
        {tab === 'plan' && <PlanTab client={client} clientData={clientData} />}
        {tab === 'reports' && <ReportsTab client={client} clientData={clientData} />}
      </div>
    </div>
  );
}
