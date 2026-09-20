import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { todayLocalDate, dateNDaysAgo } from '../../lib/patterns';
import { targetsForDate } from '../../lib/dayTargets';
import {
  adherenceScore, adherenceTone, attentionFlags, activityLabel, matchesSearch, sortSummaries, needsAttention, SORTS,
} from '../../lib/clientInsights';
import { Card, SectionLabel, ClientAvatar } from './shared';
import { avg } from './constants';

const TONE_COLOR = { good: 'var(--accent)', fair: 'var(--gold)', low: 'var(--danger)', none: 'var(--text-hint)' };
const SEVERITY_COLOR = { high: 'var(--danger)', medium: 'var(--gold)' };

// The group tag + disconnect controls at the end of every client row.
function RowActions({ row, onSetGroup, onRevoke }) {
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupInput, setGroupInput] = useState(row.group_label || '');
  const saveGroup = async () => {
    setEditingGroup(false);
    await onSetGroup(row.id, groupInput.trim());
  };
  return (
    <>
      {editingGroup ? (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <input
            value={groupInput}
            onChange={e => setGroupInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setEditingGroup(false); }}
            autoFocus
            placeholder="Group"
            aria-label="Group name"
            style={{ width: 90, padding: '4px 8px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={saveGroup} aria-label="Save group" className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 2 }}>
            <i className="ti ti-check" />
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setGroupInput(row.group_label || ''); setEditingGroup(true); }}
          className="btn-press"
          title="Set group"
          aria-label="Set group"
          style={{
            background: row.group_label ? 'var(--bg-primary)' : 'none',
            border: row.group_label ? '1px solid var(--border-default)' : 'none',
            borderRadius: 20, padding: row.group_label ? '3px 10px' : 4,
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {row.group_label || <i className="ti ti-tag" />}
        </button>
      )}
      <button
        onClick={() => { if (window.confirm(`Disconnect ${row.client?.name || 'this client'}? You'll lose access to their data immediately.`)) onRevoke(row.id); }}
        title="Disconnect"
        aria-label="Disconnect client"
        className="btn-press"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
      >
        <i className="ti ti-x" />
      </button>
    </>
  );
}

// One client, from get_client_summaries: activity, adherence and why they
// might need a message — everything a coach scans a list for.
function SummaryRow({ row, summary, index, today, onSelect, onRevoke, onSetGroup }) {
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);
  const flags = attentionFlags(summary, today);
  const todayPct = summary.calorie_target && summary.today_cal ? Number(summary.today_cal) / summary.calorie_target : 0;
  return (
    <div className="stagger-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border-default)', animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <ClientAvatar name={row.client?.name} pct={todayPct} />
      <button onClick={() => onSelect(row.client)} className="btn-press" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.client?.name || 'Unnamed client'}</span>
          {score != null && <span title="7-day adherence" style={{ color: TONE_COLOR[tone], fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{score}</span>}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{activityLabel(summary, today)}</div>
        {flags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {flags.slice(0, 2).map(f => (
              <span key={f.id} style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[f.severity], border: `1px solid ${SEVERITY_COLOR[f.severity]}`, borderRadius: 20, padding: '2px 8px' }}>{f.label}</span>
            ))}
          </div>
        )}
      </button>
      <RowActions row={row} onSetGroup={onSetGroup} onRevoke={onRevoke} />
    </div>
  );
}

// A client row previews today's totals plus a 7-day average, fetched
// independently per row so one slow client never blocks the rest of the list.
// The avatar ring fills toward today's share of the client's own calorie
// target, giving an at-a-glance signal without reading any numbers.
function LegacyClientRow({ row, index, onSelect, onRevoke, onStatus, onSetGroup }) {
  const today = todayLocalDate();
  const { dailyData, loading } = useHistory(dateNDaysAgo(6), today, row.client?.id);
  const todayData = dailyData.find(d => d.date === today);
  const loggedDays = dailyData.filter(d => d.loggedMeals > 0);
  const avgCal = loggedDays.length ? Math.round(avg(loggedDays.map(d => d.calories))) : null;
  const calorieTarget = targetsForDate(row.client, today).calories || null;
  const todayPct = calorieTarget && todayData ? todayData.calories / calorieTarget : 0;
  const loggedToday = !!todayData;
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupInput, setGroupInput] = useState(row.group_label || '');

  useEffect(() => {
    if (!loading) onStatus?.(row.id, { loggedToday });
  }, [loading, loggedToday, row.id, onStatus]);

  const saveGroup = async () => {
    setEditingGroup(false);
    await onSetGroup(row.id, groupInput.trim());
  };

  return (
    <div
      className="stagger-item"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border-default)', animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <ClientAvatar name={row.client?.name} pct={todayPct} />
      <button
        onClick={() => onSelect(row.client)}
        className="btn-press"
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{row.client?.name || 'Unnamed client'}</span>
          <span style={{ color: loading ? 'var(--text-muted)' : loggedToday ? 'var(--accent)' : 'var(--gold)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {loading ? '…' : loggedToday ? `${Math.round(todayData.calories)} kcal today` : "Hasn't logged today"}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Connected {new Date(row.created_at).toLocaleDateString()}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
            {loading ? '' : avgCal != null ? `${avgCal.toLocaleString()} kcal/day · 7d avg` : 'No data yet'}
          </span>
        </div>
      </button>
      {editingGroup ? (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <input
            value={groupInput}
            onChange={e => setGroupInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setEditingGroup(false); }}
            autoFocus
            placeholder="Group"
            style={{ width: 90, padding: '4px 8px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={saveGroup} className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 2 }}>
            <i className="ti ti-check" />
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setGroupInput(row.group_label || ''); setEditingGroup(true); }}
          className="btn-press"
          title="Set group"
          style={{
            background: row.group_label ? 'var(--bg-primary)' : 'none',
            border: row.group_label ? '1px solid var(--border-default)' : 'none',
            borderRadius: 20, padding: row.group_label ? '3px 10px' : 4,
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {row.group_label || <i className="ti ti-tag" />}
        </button>
      )}
      <button
        onClick={() => onRevoke(row.id)}
        title="Disconnect"
        className="btn-press"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
      >
        <i className="ti ti-x" />
      </button>
    </div>
  );
}

const chip = (active) => ({
  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: active ? 'var(--accent-bg)' : 'var(--bg-primary)',
  border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`,
  color: active ? 'var(--accent)' : 'var(--text-muted)',
});

// The trainer's client list. With summaries (one query for everyone) it can
// search, sort and flag who needs attention; without them — the database
// update not applied yet — it falls back to the previous per-client rows.
export default function ClientList({ clients, loading, summaries, summariesSupported, today, onSelect, onRevoke, onSetGroup, onStatus, loggedTodayCount, resolvedCount, allLoggedToday }) {
  const [query, setQuery] = useState('');
  const [sortId, setSortId] = useState('attention');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const hasClients = clients.length > 0;

  const byLink = useMemo(() => new Map(summaries.map(s => [s.link_id, s])), [summaries]);
  const visible = useMemo(() => {
    const rows = clients.map(row => ({ row, summary: byLink.get(row.id) })).filter(x => x.summary);
    const filtered = rows
      .filter(x => matchesSearch(x.summary, query))
      .filter(x => !attentionOnly || needsAttention(x.summary, today));
    const order = new Map(sortSummaries(filtered.map(x => x.summary), sortId, today).map((s, i) => [s.link_id, i]));
    return filtered.sort((a, b) => order.get(a.summary.link_id) - order.get(b.summary.link_id));
  }, [clients, byLink, query, attentionOnly, sortId, today]);
  const attentionCount = useMemo(() => summaries.filter(s => needsAttention(s, today)).length, [summaries, today]);

  // Legacy path: the old grouped list.
  const groupedClients = useMemo(() => {
    const map = new Map();
    for (const row of clients) {
      const label = row.group_label || 'Ungrouped';
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(row);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === 'Ungrouped') return 1;
      if (b[0] === 'Ungrouped') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [clients]);

  return (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabel icon="ti-users">Your clients</SectionLabel>
        {summariesSupported && hasClients && (
          attentionCount === 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>
              <i className="ti ti-circle-check" /> All on track
            </span>
          ) : (
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>{attentionCount} need{attentionCount === 1 ? 's' : ''} attention</span>
          )
        )}
        {!summariesSupported && hasClients && resolvedCount > 0 && (
          allLoggedToday ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>
              <i className="ti ti-circle-check" /> All caught up
            </span>
          ) : (
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>{loggedTodayCount}/{resolvedCount} logged today</span>
          )
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
      ) : !hasClients ? (
        <div style={{ textAlign: 'center', padding: '20px 12px' }}>
          <i className="ti ti-users" style={{ fontSize: 28, color: 'var(--text-hint)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
            Once a client accepts your invite, they'll show up here.
          </p>
        </div>
      ) : summariesSupported ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
              style={{ flex: 1, minWidth: 140, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
            <select
              value={sortId}
              onChange={e => setSortId(e.target.value)}
              aria-label="Sort clients"
              style={{ padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => setAttentionOnly(v => !v)} aria-pressed={attentionOnly} className="btn-press" style={chip(attentionOnly)}>
              Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
            </button>
          </div>
          {visible.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0 4px' }}>
              {attentionOnly && !query ? 'Nobody needs attention right now.' : 'No clients match.'}
            </p>
          ) : (
            visible.map(({ row, summary }, i) => (
              <SummaryRow key={row.id} row={row} summary={summary} index={i} today={today} onSelect={onSelect} onRevoke={onRevoke} onSetGroup={onSetGroup} />
            ))
          )}
        </>
      ) : (
        groupedClients.map(([label, rows]) => (
          <div key={label}>
            {groupedClients.length > 1 && (
              <div style={{ color: 'var(--text-hint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
                {label} <span style={{ fontWeight: 400 }}>({rows.length})</span>
              </div>
            )}
            {rows.map((row, i) => (
              <LegacyClientRow key={row.id} row={row} index={i} onSelect={onSelect} onRevoke={onRevoke} onStatus={onStatus} onSetGroup={onSetGroup} />
            ))}
          </div>
        ))
      )}
    </Card>
  );
}
