import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { todayLocalDate, dateNDaysAgo } from '../../lib/patterns';
import { targetsForDate } from '../../lib/dayTargets';
import {
  adherenceScore, adherenceTone, attentionFlags, activityLabel, matchesSearch, sortSummaries, needsAttention, SORTS,
} from '../../lib/clientInsights';
import { Card, SectionLabel } from './shared';
import { avg } from './constants';
import { tolerancePct, COMPLETE_DAY_MEALS } from '../../lib/adherence';
import ListRow from '../ListRow';
import FilterChipRow from '../FilterChipRow';

// Red only for what is urgent; everything else stays in the app's palette.
const SEVERITY_COLOR = { high: 'var(--danger)', medium: 'var(--gold)' };
const TONE_COLOR = { good: 'var(--accent-secondary)', fair: 'var(--gold)', low: 'var(--danger)' };
// A short list needs no controls: search and sort only appear once a list is
// long enough to need them, and the filters once there's something to filter.
export const FILTERS_FROM = 4;
export const SEARCH_FROM = 9;
// What the percentage on each row means — shown behind the (i) button.
const ADHERENCE_HELP = `7-day adherence: how consistently they log, and how often they land within ${tolerancePct()}% of their calorie target and 90% of protein, on days with ${COMPLETE_DAY_MEALS}+ meals logged.`;

// A small tinted pill (no outline) for the reasons a client needs a look.
function Tag({ color, children }) {
  return (
    <span style={{
      display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', padding: '4px 10px', borderRadius: 99,
      fontSize: 12, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere',
      color: `color-mix(in srgb, ${color} 75%, var(--text-primary))`,
      background: `color-mix(in srgb, ${color} 14%, var(--bg-card))`,
    }}>{children}</span>
  );
}

// One client as its own card, from get_client_summaries: activity, adherence
// and why they might need a message — everything a coach scans a list for.
// The whole card is the tap target (opens ClientDetail via onSelect); the
// reasons sit inside it, so nothing ever overlaps a divider line. The
// group-tag/disconnect actions live in ClientDetail's own header.
function SummaryRow({ row, summary, index, today, onSelect, onMessage, unreadCount = 0, showCoach = false }) {
  const score = adherenceScore(summary);
  const tone = adherenceTone(score);
  const flags = attentionFlags(summary, today);
  const todayPct = summary.calorie_target && summary.today_cal ? Number(summary.today_cal) / summary.calorie_target : 0;
  const open = () => onSelect(row.client);
  return (
    <div className="stagger-item" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <Card
        role="button" tabIndex={0} onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        className="btn-press"
        style={{ padding: 14, marginBottom: 10, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <ListRow.SquareAvatar name={row.client?.name} pct={todayPct} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{row.client?.name || 'Unnamed client'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>{activityLabel(summary, today)}</div>
            {showCoach && summary.coach_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflowWrap: 'anywhere' }}>Coach: {summary.coach_name}</div>}
          </div>
          {score != null && (
            <span role="img" title={ADHERENCE_HELP} aria-label={`7-day adherence ${score} percent`} style={{ fontSize: 20, fontWeight: 800, color: TONE_COLOR[tone] || 'var(--text-secondary)', flexShrink: 0 }}>{score}%</span>
          )}
          {onMessage && (
            <button
              type="button"
              aria-label={`Message ${row.client?.name || 'client'}`}
              onClick={(e) => { e.stopPropagation(); onMessage(row.client); }}
              onKeyDown={(e) => e.stopPropagation()}
              className="app-icon-btn"
              style={{ width: 44, height: 44, position: 'relative' }}
            >
              <i className="ti ti-message-circle" aria-hidden="true" />
              {unreadCount > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent-secondary)', border: '2px solid var(--bg-card)', boxSizing: 'content-box' }} />}
            </button>
          )}
          {/* The whole card opens the client, so on the narrowest phones the chevron
              gives its room to the name instead. */}
          <span className="hide-on-narrow"><ListRow.Chevron /></span>
        </div>
        {/* One reason, the most urgent — the rest are on the client's page. */}
        {(flags.length > 0 || unreadCount > 0) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            {unreadCount > 0 && <Tag color="var(--accent-secondary)">{unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}</Tag>}
            {flags.slice(0, 1).map(f => <Tag key={f.id} color={SEVERITY_COLOR[f.severity]}>{f.label}</Tag>)}
            {flags.length > 1 && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>+{flags.length - 1} more</span>}
          </div>
        )}
      </Card>
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
export default function ClientList({ clients, loading, summaries, summariesSupported, today, onSelect, onMessage, onStatus, loggedTodayCount, resolvedCount, allLoggedToday, unread = new Map(), title = 'Your clients', showCoach = false, hideUnread = false, emptyText = "Once a client accepts your invite, they'll show up here." }) {
  const [query, setQuery] = useState('');
  const [sortId, setSortId] = useState('attention');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const hasClients = clients.length > 0;

  const byLink = useMemo(() => new Map(summaries.map(s => [s.link_id, s])), [summaries]);
  const visible = useMemo(() => {
    const rows = clients.map(row => ({ row, summary: byLink.get(row.id) })).filter(x => x.summary);
    const filtered = rows
      .filter(x => matchesSearch(x.summary, query))
      .filter(x => !attentionOnly || needsAttention(x.summary, today))
      .filter(x => !unreadOnly || unread.has(x.summary.client_id));
    const order = new Map(sortSummaries(filtered.map(x => x.summary), sortId, today).map((s, i) => [s.link_id, i]));
    return filtered.sort((a, b) => order.get(a.summary.link_id) - order.get(b.summary.link_id));
  }, [clients, byLink, query, attentionOnly, unreadOnly, unread, sortId, today]);
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

  const [showHelp, setShowHelp] = useState(false);
  const statusChip = summariesSupported && hasClients ? (
    attentionCount === 0 ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-secondary)', fontSize: 12, fontWeight: 700 }}>
        <i className="ti ti-circle-check" /> All on track
      </span>
    ) : (
      <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>{attentionCount} need{attentionCount === 1 ? 's' : ''} attention</span>
    )
  ) : !summariesSupported && hasClients && resolvedCount > 0 ? (
    allLoggedToday ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-secondary)', fontSize: 12, fontWeight: 700 }}>
        <i className="ti ti-circle-check" /> All caught up
      </span>
    ) : (
      <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>{loggedTodayCount}/{resolvedCount} logged today</span>
    )
  ) : null;

  const heading = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <SectionLabel icon="ti-users" style={{ margin: 0 }}>{title}</SectionLabel>
        {summariesSupported && hasClients && (
          <button type="button" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp} aria-label="About the percentage" className="hit-slop"
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: 16, display: 'flex', cursor: 'pointer' }}>
            <i className="ti ti-info-circle" aria-hidden="true" />
          </button>
        )}
      </div>
      {statusChip}
    </div>
  );

  // Not the summaries path (or nobody yet): a single card, as before.
  if (!(summariesSupported && hasClients && !loading)) {
    return (
      <Card style={{ marginBottom: 0 }}>
        {heading}
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : !hasClients ? (
          <div style={{ textAlign: 'center', padding: '20px 12px' }}>
            <i className="ti ti-users" style={{ fontSize: 28, color: 'var(--text-hint)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
              {emptyText}
            </p>
          </div>
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

  const sortLabel = SORTS.find(x => x.id === sortId)?.label || 'Sort';
  const showSearch = clients.length >= SEARCH_FROM;
  const showFilters = clients.length >= FILTERS_FROM;
  return (
    <section>
      {heading}
      {showHelp && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5, margin: '0 0 12px' }}>
          The % on each card is 7-day adherence.
        </p>
      )}
      {(showSearch || showFilters) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {showSearch && (
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
          style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 14, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
        />
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {showFilters ? (
          <FilterChipRow>
            <FilterChipRow.Chip
              active={attentionOnly}
              onClick={() => setAttentionOnly(v => !v)}
              onClear={attentionOnly ? () => setAttentionOnly(false) : undefined}
            >
              Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
            </FilterChipRow.Chip>
            {!hideUnread && (
              <FilterChipRow.Chip
                active={unreadOnly}
                onClick={() => setUnreadOnly(v => !v)}
                onClear={unreadOnly ? () => setUnreadOnly(false) : undefined}
              >
                Unread{unread.size > 0 ? ` (${unread.size})` : ''}
              </FilterChipRow.Chip>
            )}
          </FilterChipRow>
          ) : <span />}
          {/* The real <select> sits invisibly over a tidy pill, so it keeps the
              native picker (and screen-reader behaviour) without a boxed dropdown. */}
          {showSearch && (
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'var(--chip-bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, minHeight: 32, boxSizing: 'border-box' }}>
            <i className="ti ti-arrows-sort" aria-hidden="true" style={{ fontSize: 14 }} />
            <span>Sort: {sortLabel}</span>
            <select
              value={sortId}
              onChange={e => setSortId(e.target.value)}
              aria-label="Sort clients"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', fontSize: 16 }}
            >
              {SORTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          )}
        </div>
      </div>
      )}
      {visible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0 4px' }}>
          {unreadOnly && !query ? 'No unread messages.' : attentionOnly && !query ? 'Nobody needs attention right now.' : 'No clients match.'}
        </p>
      ) : (
        visible.map(({ row, summary }, i) => (
          <SummaryRow key={row.id} row={row} summary={summary} index={i} today={today} onSelect={onSelect} onMessage={onMessage} showCoach={showCoach} unreadCount={unread.get(summary.client_id)?.unread || 0} />
        ))
      )}
    </section>
  );
}
