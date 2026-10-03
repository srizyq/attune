import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { todayLocalDate, dateNDaysAgo } from '../../lib/patterns';
import { targetsForDate } from '../../lib/dayTargets';
import {
  adherenceScore, adherenceTone, attentionFlags, activityLabel, matchesSearch, sortSummaries, needsAttention, SORTS,
} from '../../lib/clientInsights';
import { Card, SectionLabel } from './shared';
import { avg } from './constants';
import ListRow from '../ListRow';
import FilterChipRow from '../FilterChipRow';

const SEVERITY_COLOR = { high: 'var(--danger)', medium: 'var(--gold)' };

// One client, from get_client_summaries: activity, adherence and why they
// might need a message — everything a coach scans a list for. Tapping the
// row opens ClientDetail (via onSelect); the group-tag/disconnect actions
// that used to live inline here now live in ClientDetail's own header,
// since the row is a single tap target now rather than a name + inline
// actions.
function SummaryRow({ row, summary, index, today, onSelect }) {
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);
  const flags = attentionFlags(summary, today);
  const todayPct = summary.calorie_target && summary.today_cal ? Number(summary.today_cal) / summary.calorie_target : 0;
  return (
    <div className="stagger-item" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <ListRow
        avatar={<ListRow.SquareAvatar name={row.client?.name} pct={todayPct} />}
        title={row.client?.name || 'Unnamed client'}
        subtitleParts={[activityLabel(summary, today)]}
        trailing={score != null ? <ListRow.Badge tone={tone === 'low' ? 'warning' : 'accent'} withChevron>{score}</ListRow.Badge> : <ListRow.Chevron />}
        onClick={() => onSelect(row.client)}
      />
      {flags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '-6px 0 6px 56px' }}>
          {flags.slice(0, 2).map(f => (
            <span key={f.id} style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[f.severity], border: `1px solid ${SEVERITY_COLOR[f.severity]}`, borderRadius: 20, padding: '2px 8px' }}>{f.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// A client row previews today's totals plus a 7-day average, fetched
// independently per row so one slow client never blocks the rest of the list.
// The avatar ring fills toward today's share of the client's own calorie
// target, giving an at-a-glance signal without reading any numbers.
function LegacyClientRow({ row, index, onSelect, onStatus }) {
  const today = todayLocalDate();
  const { dailyData, loading } = useHistory(dateNDaysAgo(6), today, row.client?.id);
  const todayData = dailyData.find(d => d.date === today);
  const loggedDays = dailyData.filter(d => d.loggedMeals > 0);
  const avgCal = loggedDays.length ? Math.round(avg(loggedDays.map(d => d.calories))) : null;
  const calorieTarget = targetsForDate(row.client, today).calories || null;
  const todayPct = calorieTarget && todayData ? todayData.calories / calorieTarget : 0;
  const loggedToday = !!todayData;

  useEffect(() => {
    if (!loading) onStatus?.(row.id, { loggedToday });
  }, [loading, loggedToday, row.id, onStatus]);

  return (
    <div className="stagger-item" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <ListRow
        avatar={<ListRow.SquareAvatar name={row.client?.name} pct={todayPct} />}
        title={row.client?.name || 'Unnamed client'}
        subtitleParts={[
          loading ? '…' : loggedToday ? `${Math.round(todayData.calories)} kcal today` : "Hasn't logged today",
          loading ? null : avgCal != null ? `${avgCal.toLocaleString()} kcal/day · 7d avg` : 'No data yet',
        ]}
        trailing={<ListRow.Chevron />}
        onClick={() => onSelect(row.client)}
      />
    </div>
  );
}

// The trainer's client list. With summaries (one query for everyone) it can
// search, sort and flag who needs attention; without them — the database
// update not applied yet — it falls back to the previous per-client rows.
export default function ClientList({ clients, loading, summaries, summariesSupported, today, onSelect, onStatus, loggedTodayCount, resolvedCount, allLoggedToday }) {
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
            <select
              value={sortId}
              onChange={e => setSortId(e.target.value)}
              aria-label="Sort clients"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <FilterChipRow>
              <FilterChipRow.Chip
                active={attentionOnly}
                onClick={() => setAttentionOnly(v => !v)}
                onClear={attentionOnly ? () => setAttentionOnly(false) : undefined}
              >
                Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
              </FilterChipRow.Chip>
              <FilterChipRow.Chip>Active ({Math.max(0, clients.length - attentionCount)})</FilterChipRow.Chip>
            </FilterChipRow>
          </div>
          {visible.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0 4px' }}>
              {attentionOnly && !query ? 'Nobody needs attention right now.' : 'No clients match.'}
            </p>
          ) : (
            visible.map(({ row, summary }, i) => (
              <SummaryRow key={row.id} row={row} summary={summary} index={i} today={today} onSelect={onSelect} />
            ))
          )}
        </>
      ) : (
        groupedClients.map(([label, rows]) => (
          <div key={label}>
            {groupedClients.length > 1 && (
              <div style={{ color: 'var(--text-hint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
                {label} <span style={{ fontWeight: 500 }}>({rows.length})</span>
              </div>
            )}
            {rows.map((row, i) => (
              <LegacyClientRow key={row.id} row={row} index={i} onSelect={onSelect} onStatus={onStatus} />
            ))}
          </div>
        ))
      )}
    </Card>
  );
}
