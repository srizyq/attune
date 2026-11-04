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
  const sub = [MEAL_LABEL[row.meal], portion].filter(Boolean).join(' · ');
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
            {row.kind === 'estimated' ? '~' : ''}{fmtAmount(nutrient, row.amount)}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{nutrient.unit}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.share < 1 ? '<1' : Math.round(row.share)}%</div>
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

  const { meals, loading } = useFoodLogs(date);
  const items = useMemo(() => Object.values(meals).flat(), [meals]);
  const estimates = useMicroEstimates(items, { pro: isPremium });
  const result = useMemo(() => (nutrient ? contributorsFor(key, items, estimates) : null), [key, nutrient, items, estimates]);
  const [detail, setDetail] = useState(null);
  const { closing, close } = useClosingTransition(() => setDetail(null));

  const initials = (profile?.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const back = () => navigate('/nutrients', { state: { date } });
  function shiftDate(days) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const next = todayLocalDate(d);
    if (next > today) return;
    setParams({ date: next }, { replace: true });
  }

  const target = Number(profile?.micro_targets?.[key]) || nutrient?.defaultTarget || null;
  const pct = target && result ? (result.total / target) * 100 : null;
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
              <Card style={{ padding: 22, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{isToday ? 'Today' : 'Total'}</div>
                <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>
                  {result.total > 0 || result.count > 0 ? <>{approx ? '~' : ''}{fmtAmount(nutrient, result.total)}</> : '—'}
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}> {nutrient.unit}{target ? ` / ${target}${nutrient.unit}` : ''}</span>
                </div>
                {pct !== null && (
                  <div style={{ height: 6, background: 'var(--border-default)', borderRadius: 99, marginTop: 12 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: nutrient.color, borderRadius: 99 }} />
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{pct !== null ? `${Math.round(pct)}% of your target · ` : ''}{nutrient.guideline}</div>
                {note && <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.4 }}>{note}</div>}
              </Card>

              {result.count === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
                  {isToday ? 'Nothing logged today yet.' : 'Nothing logged on this day.'}
                </div>
              )}

              {result.count > 0 && (
                <div style={{ position: 'relative' }}>
                  <Card style={{ padding: '18px 18px 6px', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Foods that supplied it</div>
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
            </>
          )}
        </div>
      </div>
      {detail && <FoodDetailsPage food={detail} onClose={close} closing={closing} pro={isPremium} />}
    </div>
  );
}
