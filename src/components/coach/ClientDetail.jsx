import { useEffect, useRef, useState } from 'react';
import { setClientTargets } from '../../lib/db';
import { adherenceScore, adherenceTone } from '../../lib/clientInsights';
import { useClientDashboard } from './useClientDashboard';
import { ClientAvatar } from './shared';
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
export default function ClientDetail({ client, summary }) {
  // A mutable local copy of the client's goal/target fields — resyncs from the
  // prop whenever a different client is selected, but otherwise holds whatever
  // the trainer just saved so the page reflects it without refetching the list.
  const [clientData, setClientData] = useState(client);
  const [editingTargets, setEditingTargets] = useState(false);
  const [tab, setTab] = useState('overview');
  const tabRefs = useRef({});
  useEffect(() => { setClientData(client); setEditingTargets(false); }, [client]);
  // Back to Overview only for a *different* client — a refetch that hands us a
  // fresh object for the same one must not throw the coach out of the tab
  // they're working in.
  useEffect(() => { setTab('overview'); }, [client.id]);

  // On a phone the six tabs overflow and scroll sideways; keep the selected
  // one in view (optional-called: jsdom, and old browsers, lack scrollIntoView).
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const handleSaveTargets = async (fields) => {
    await setClientTargets(client.id, fields);
    setClientData(prev => ({ ...prev, ...fields }));
    setEditingTargets(false);
  };

  const d = useClientDashboard(client, clientData);
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);
  const todayPct = summary?.calorie_target && summary.today_cal ? Number(summary.today_cal) / summary.calorie_target : 0;

  // WAI-ARIA tabs: arrows move between tabs, Home/End jump to the ends.
  const onKeyDown = (e) => {
    const idx = TABS.findIndex(t => t.id === tab);
    const next = { ArrowRight: (idx + 1) % TABS.length, ArrowLeft: (idx - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <ClientAvatar name={clientData.name} pct={todayPct} size={48} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{clientData.name || 'Client'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {[GOAL_LABELS[clientData.goal], summary?.group_label].filter(Boolean).join(' · ') || 'No goal set'}
          </div>
        </div>
        {score != null && (
          <div title="Logging consistency and target hits over the last 7 days" style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: TONE_COLOR[tone], lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>7-day adherence</div>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Client sections"
        onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--border-default)', marginBottom: 20, scrollbarWidth: 'none' }}
      >
        {TABS.map(t => {
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
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1,
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
          <OverviewTab clientData={clientData} d={d} summary={summary} editingTargets={editingTargets} setEditingTargets={setEditingTargets} onSaveTargets={handleSaveTargets} />
        )}
        {tab === 'diary' && <DiaryTab d={d} />}
        {tab === 'progress' && <ProgressTab d={d} />}
        {tab === 'messages' && <MessagesTab client={client} clientData={clientData} d={d} />}
        {tab === 'plan' && <PlanTab clientData={clientData} />}
        {tab === 'reports' && <ReportsTab client={client} clientData={clientData} />}
      </div>
    </div>
  );
}
