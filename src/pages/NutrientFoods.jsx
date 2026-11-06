import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { useMicroEstimates } from '../hooks/useMicroEstimates';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { hasProAccess } from '../lib/proAccess';
import { todayLocalDate } from '../lib/patterns';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { contributorsFor, contributorsNote, fmtAmount } from '../lib/nutrientContributors';
import { dailyTotals, groupedContributors, loggedDayCount, rangeDates } from '../lib/nutrientRange';
import { targetFor, targetNote } from '../lib/nutrientTargets';
import { NUTRIENT_INFO, LIMIT_KEYS } from '../lib/nutrientInfo';
import { useFoodLogsRange } from '../hooks/useFoodLogsRange';
import SegToggle from '../components/SegToggle';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import DateStepper from '../components/DateStepper';
import Card from '../components/Card';
import { FoodDetailsPage } from '../components/FoodDetails';

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const VIA_LABEL = { ausnut: 'Estimated from a similar food', usda: 'Estimated from a similar food (USDA)', ai: 'AI estimate' };

const portionOf = (item) => item.servingLabel || (item.loggedAmount != null && item.loggedUnit ? `${item.loggedAmount} ${item.loggedUnit}` : null);

function Row({ row, nutrient, color, onOpen, locked }) {
  const portion = portionOf(row.item);
  const sub = [row.perDay != null ? null : MEAL_LABEL[row.meal], row.perDay != null ? null : portion].filter(Boolean).join(' · ');
  // A locked (blurred) row is plain content under the upgrade card, not a button.
  const Tag = locked ? 'div' : 'button';
  return (
    <Tag
      {...(locked ? {} : { type: 'button', onClick: onOpen, 'aria-label': `${row.name}: see all nutrients` })}
      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', padding: '12px 0', fontFamily: 'inherit', color: 'inherit', cursor: locked ? 'default' : 'pointer', minHeight: 44 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{row.name}</div>
          {(row.brand || sub) && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, overflowWrap: 'anywhere' }}>{[row.brand, sub].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: row.kind === 'estimated' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            {row.kind === 'estimated' ? '~' : ''}{fmtAmount(nutrient, row.perDay ?? row.amount)}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{nutrient.unit}{row.perDay != null ? '/day' : ''}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.share < 1 ? '<1' : Math.round(row.share)}%</div>
          {row.times > 1 && <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{row.times} times</div>}
        </div>
      </div>
      <div style={{ height: 5, background: 'var(--border-default)', borderRadius: 99, marginTop: 8 }}>
        <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, row.share))}%`, background: color, borderRadius: 99, opacity: row.kind === 'estimated' ? 0.55 : 1 }} />
      </div>
      {row.kind === 'estimated' && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>{VIA_LABEL[row.via] || VIA_LABEL.ausnut}</div>}
    </Tag>
  );
}

/**
 * One nutrient's page (Pro): which foods supplied it on a day and how much of
 * the day's total each was. Opened from a card on the Nutrients page.
 */
export default function NutrientFoods() {
  const navigate = useNavigate();
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const { profile } = useProfile();
  const today = todayLocalDate();
  const requested = params.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const isToday = date === today;
  const nutrient = MICRO_NUTRIENTS.find((n) => n.key === key);
  const isPremium = hasProAccess(profile);

  const range = ['7', '30'].includes(params.get('range')) ? params.get('range') : 'day';
  const isRange = range !== 'day';
  const rangeDayCount = range === '30' ? 30 : 7;
  const { meals, loading: dayLoading } = useFoodLogs(date, { supplements: true });
  const rangeData = useFoodLogsRange(date, rangeDayCount, isRange);
  const dayItems = useMemo(() => Object.values(meals).flat().map((i) => ({ ...i, loggedDate: date })), [meals, date]);
  const items = isRange ? rangeData.items : dayItems;
  const loading = isRange ? rangeData.loading : dayLoading;
  const estimates = useMicroEstimates(items, { pro: isPremium, ai: !isRange });
  const dates = useMemo(() => (isRange ? rangeData.dates : rangeDates(date, 1)), [isRange, rangeData.dates, date]);
  const loggedDays = loggedDayCount(items);
  const result = useMemo(() => {
    if (!nutrient) return null;
    if (!isRange) return contributorsFor(key, items, estimates);
    const g = groupedContributors(key, items, estimates, loggedDays);
    return { ...g, estimatedTotal: g.rows.filter((r) => r.kind === 'estimated').reduce((sum, r) => sum + r.amount, 0), count: items.length };
  }, [key, nutrient, items, estimates, isRange, loggedDays]);
  const series = useMemo(() => (isRange && nutrient ? dailyTotals(key, items, estimates, dates) : null), [isRange, nutrient, key, items, estimates, dates]);
  const [detail, setDetail] = useState(null);
  const { closing, close } = useClosingTransition(() => setDetail(null));

  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const back = () => navigate('/nutrients', { state: { date } });
  function shiftDate(days) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const next = todayLocalDate(d);
    if (next > today) return;
    setParams(isRange ? { date: next, range } : { date: next }, { replace: true });
  }

  const targetInfo = nutrient ? targetFor(key, profile) : { value: null, source: null };
  const target = targetInfo.value;
  const shownTotal = result ? (isRange ? result.perDay : result.total) : 0;
  const pct = target && result ? (shownTotal / target) * 100 : null;
  const isLimit = LIMIT_KEYS.has(key);
  const info = NUTRIENT_INFO[key];
  const setRange = (value) => setParams(value === 'day' ? { date } : { date, range: value }, { replace: true });
  const approx = result && result.estimatedTotal > 0;
  const note = result ? contributorsNote(result) : null;

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="dashboard" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title={nutrient ? nutrient.label : 'Nutrient'} subtitle="Where it came from" onBack={back} backLabel="Back to Nutrients">
          <DateStepper selectedDate={date} isToday={isToday} onShift={shiftDate} />
        </PageHeader>
        <div className="page-pad" style={{ maxWidth: 700 }} data-testid="nutrient-foods">
          {!nutrient && (
            <Card style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              We don&apos;t track that nutrient. <button type="button" onClick={back} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>Back to Nutrients</button>
            </Card>
          )}
          {nutrient && !loading && result && (
            <>
              <SegToggle label="Period" value={range} onChange={setRange} style={{ marginBottom: 14 }} options={[{ value: 'day', label: 'Day' }, { value: '7', label: '7-day avg' }, { value: '30', label: '30-day avg' }]} />
              <Card style={{ padding: 22, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{isRange ? `Daily average · ${loggedDays} of ${rangeDayCount} days logged` : isToday ? 'Today' : 'Total'}</div>
                <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>
                  {shownTotal > 0 || result.count > 0 ? <>{approx ? '~' : ''}{fmtAmount(nutrient, shownTotal)}</> : '—'}
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}> {nutrient.unit}{target ? ` / ${target}${nutrient.unit}` : ''}</span>
                </div>
                {pct !== null && (
                  <div style={{ height: 6, background: 'var(--border-default)', borderRadius: 99, marginTop: 12 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: nutrient.color, borderRadius: 99 }} />
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{pct !== null ? `${Math.round(pct)}% of ${isLimit ? 'the limit' : 'your target'} · ` : ''}{targetInfo.source === 'personal' ? `${targetNote('personal')} (${isLimit ? 'aim for under ' : ''}${target}${nutrient.unit}/day)` : targetInfo.source === 'custom' ? 'Your target' : nutrient.guideline}</div>
                {note && <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.4 }}>{note}</div>}
              </Card>

              {isRange && series && loggedDays > 0 && (
                <Card style={{ padding: '16px 18px', marginBottom: 16 }} data-testid="nutrient-daily-bars">
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Day by day</div>
                  {(() => {
                    const max = Math.max(target || 0, ...series.days.map((d) => d.total), 0.0001);
                    return (
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: series.days.length > 14 ? 2 : 6, height: 90 }}>
                        {target ? <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${(target / max) * 100}%`, borderTop: '1px dashed var(--text-hint)' }} /> : null}
                        {series.days.map((d) => (
                          <div key={d.date} title={`${d.date}: ${d.logged ? `${fmtAmount(nutrient, d.total)}${nutrient.unit}` : 'nothing logged'}`} style={{ flex: 1, minWidth: 0, height: d.logged ? `${Math.max(3, (d.total / max) * 100)}%` : 3, background: d.logged ? nutrient.color : 'var(--border-default)', borderRadius: 3 }} />
                        ))}
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>
                    <span>{new Date(`${dates[0]}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                    {target ? <span>- - target {target}{nutrient.unit}</span> : null}
                    <span>{new Date(`${dates[dates.length - 1]}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </Card>
              )}

              {result.count === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
                  {isRange ? 'Nothing logged in this period.' : isToday ? 'Nothing logged today yet.' : 'Nothing logged on this day.'}
                </div>
              )}

              {result.count > 0 && (
                <div style={{ position: 'relative' }}>
                  <Card style={{ padding: '18px 18px 6px', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{isRange ? 'Foods that supplied it (per logged day)' : 'Foods that supplied it'}</div>
                    <div style={!isPremium ? { filter: 'blur(6px)', userSelect: 'none', pointerEvents: 'none' } : undefined} aria-hidden={!isPremium}>
                      {result.rows.length === 0 && <div style={{ fontSize: 14, color: 'var(--text-muted)', padding: '14px 0' }}>None of the foods logged supplied any {nutrient.label.toLowerCase()}.</div>}
                      {result.rows.map((row) => (
                        <Row key={row.id} row={row} nutrient={nutrient} color={nutrient.color} locked={!isPremium} onOpen={() => setDetail(row.item)} />
                      ))}
                      {(result.unknown.length > 0 || result.none.length > 0) && (
                        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          {result.unknown.length > 0 && <div><strong style={{ fontWeight: 700 }}>No data:</strong> {result.unknown.map((r) => r.name).join(', ')}</div>}
                          {result.none.length > 0 && <div style={{ marginTop: result.unknown.length ? 4 : 0 }}><strong style={{ fontWeight: 700 }}>None:</strong> {result.none.map((r) => r.name).join(', ')}</div>}
                        </div>
                      )}
                    </div>
                  </Card>
                  {!isPremium && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 14, padding: '18px 20px', textAlign: 'center', maxWidth: 320, boxShadow: 'var(--card-shadow)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em', display: 'inline-block', marginBottom: 8 }}>PRO</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>See what&apos;s in your {nutrient.label.toLowerCase()}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>Every food you logged, ranked by how much it supplied.</div>
                        <button type="button" onClick={() => navigate('/pricing')} style={{ minHeight: 44, padding: '0 18px', background: 'var(--accent)', color: 'var(--accent-contrast, #fff)', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Upgrade to Pro</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {info && (
                <Card style={{ padding: '18px 18px 14px', marginBottom: 16 }} data-testid="nutrient-info">
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>What it does</div>
                  <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-primary)' }}>{info.does}</p>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{isLimit ? 'Where it comes from' : 'Good sources'}</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                    {info.sources.map((src) => <li key={src}>{src}</li>)}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
      {detail && <FoodDetailsPage food={detail} onClose={close} closing={closing} pro={isPremium} />}
    </div>
  );
}
