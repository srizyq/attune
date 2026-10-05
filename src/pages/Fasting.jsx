import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFasting } from '../hooks/useFasting';
import { useFastEndNotifications } from '../hooks/useReminders';
import { pushSupported } from '../lib/pushNotifications';
import {
  FAST_PRESETS, DEFAULT_FAST_HOURS, MIN_FAST_HOURS, MAX_FAST_HOURS,
  parseTargetHours, fastEndsAt, fastProgress, formatClock, formatDuration, formatHours, hitGoal,
} from '../lib/fasting';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import FormRow from '../components/FormRow';
import Card from '../components/Card';
import { SectionLabel, FieldRow, Toggle } from '../components/settings/primitives';

const RING_SIZE = 208;
const RING_STROKE = 12;

const chipStyle = (active) => ({
  flex: '1 1 0', minWidth: 56, padding: '10px 6px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: active ? 'var(--accent-bg)' : 'transparent',
  border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`,
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
});

function timeLabel(date, nowMs) {
  const sameDay = date.toDateString() === new Date(nowMs).toDateString();
  const time = date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today at ${time}` : `${date.toLocaleDateString('en-AU', { weekday: 'short' })} at ${time}`;
}

// The round progress ring with the live clock inside it.
function Ring({ pct, done, children }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, margin: '0 auto 16px', maxWidth: '100%' }}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={{ transform: 'rotate(-90deg)', display: 'block', maxWidth: '100%' }} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
          stroke={done ? 'var(--success, #5fb97a)' : 'var(--accent)'} strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        {children}
      </div>
    </div>
  );
}

function StartPanel({ busy, onStart }) {
  const [hours, setHours] = useState(DEFAULT_FAST_HOURS);
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const parsed = custom ? parseTargetHours(customText) : hours;

  return (
    <Card style={{ padding: 20 }}>
      <SectionLabel>Start a fast</SectionLabel>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '-6px 0 14px' }}>
        Pick how long you plan to go without eating. Your goal is "fasting hours : eating hours".
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FAST_PRESETS.map((p) => (
          <button key={p.hours} type="button" className="btn-press" onClick={() => { setCustom(false); setHours(p.hours); }} style={chipStyle(!custom && hours === p.hours)} aria-pressed={!custom && hours === p.hours}>
            {p.label}
          </button>
        ))}
        <button type="button" className="btn-press" onClick={() => setCustom(true)} style={chipStyle(custom)} aria-pressed={custom}>Custom</button>
      </div>
      {custom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            type="number" inputMode="decimal" min={MIN_FAST_HOURS} max={MAX_FAST_HOURS} step="0.5" autoFocus
            value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Hours"
            aria-label="Fast length in hours"
            style={{ width: 100, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '9px 10px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{MIN_FAST_HOURS}–{MAX_FAST_HOURS} hours</span>
        </div>
      )}
      <FormRow>
        <FormRow.Button icon="ti-player-play" primary disabled={busy || parsed == null} onClick={() => onStart(parsed)}>
          {busy ? 'Starting…' : parsed == null ? 'Enter a length' : `Start ${formatHours(parsed)} fast`}
        </FormRow.Button>
      </FormRow>
    </Card>
  );
}

function RunningPanel({ fast, nowMs, busy, onEnd, onDiscard }) {
  const [confirming, setConfirming] = useState(null); // null | 'end' | 'discard'
  const p = fastProgress(fast, nowMs);
  const ends = fastEndsAt(fast);

  return (
    <Card style={{ padding: 20 }}>
      <SectionLabel>{p.done ? 'Goal reached' : 'Fasting'}</SectionLabel>
      <Ring pct={p.pct} done={p.done}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }} aria-label="Time fasted">
          {formatClock(p.elapsedMs)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>of your {formatHours(fast.target_hours)} goal</div>
      </Ring>
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
        {p.done
          ? <>You hit your goal {formatDuration(p.overMs) === '0m' ? 'just now' : `${formatDuration(p.overMs)} ago`}. Eat when you're ready.</>
          : <>{formatDuration(p.remainingMs)} to go · ends {timeLabel(ends, nowMs)}</>}
        <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Started {timeLabel(new Date(fast.started_at), nowMs)}</div>
      </div>

      {confirming === 'end' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 10, lineHeight: 1.5 }}>
          End now, {formatDuration(p.remainingMs)} short of your goal?
        </div>
      )}
      {confirming === 'discard' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 10, lineHeight: 1.5 }}>
          Discard this fast? It won't be saved to your history.
        </div>
      )}
      <FormRow>
        {confirming === 'end' && (
          <>
            <FormRow.Button icon="ti-player-stop" primary disabled={busy} onClick={onEnd}>{busy ? 'Ending…' : 'Yes, end fast'}</FormRow.Button>
            <FormRow.Button onClick={() => setConfirming(null)}>Keep fasting</FormRow.Button>
          </>
        )}
        {confirming === 'discard' && (
          <>
            <FormRow.Button icon="ti-trash" danger disabled={busy} onClick={onDiscard}>{busy ? 'Discarding…' : 'Yes, discard'}</FormRow.Button>
            <FormRow.Button onClick={() => setConfirming(null)}>Keep it</FormRow.Button>
          </>
        )}
        {confirming == null && (
          <>
            <FormRow.Button icon="ti-player-stop" primary disabled={busy} onClick={() => (p.done ? onEnd() : setConfirming('end'))}>
              {busy ? 'Ending…' : 'End fast'}
            </FormRow.Button>
            <button
              type="button" onClick={() => setConfirming('discard')} className="btn-press"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, padding: '8px', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Started by mistake? Discard
            </button>
          </>
        )}
      </FormRow>
    </Card>
  );
}

function NotifyCard({ running }) {
  const notifs = useFastEndNotifications();
  const [error, setError] = useState(null);
  return (
    <Card style={{ padding: 20 }}>
      <FieldRow label="Notify me when my fast ends" hint={notifs.enabled ? "We'll send a push when you reach your goal (within about 15 minutes, and not overnight)" : 'A push when you reach your goal, even with the app closed'}>
        <Toggle
          on={notifs.enabled}
          onChange={async (on) => {
            setError(null);
            try {
              if (on) await notifs.enable();
              else await notifs.disable();
            } catch (err) {
              setError(err.message || "Couldn't update this — try again.");
            }
          }}
        />
      </FieldRow>
      {!pushSupported() && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>Push notifications aren't supported in this browser.</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}
      {!notifs.enabled && running && !error && (
        <p style={{ color: 'var(--text-hint)', fontSize: 12, margin: 0 }}>Turn this on and we'll tell you when this fast is done.</p>
      )}
    </Card>
  );
}

function HistoryCard({ history }) {
  return (
    <Card style={{ padding: 20 }}>
      <SectionLabel>Recent fasts</SectionLabel>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>Fasts you finish will show up here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {history.map((f, i) => {
            const hit = hitGoal(f);
            const ran = fastProgress(f, new Date(f.ended_at).getTime()).elapsedMs;
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-default)' }}>
                <i className={`ti ${hit ? 'ti-circle-check' : 'ti-circle-dashed'}`} aria-hidden="true" style={{ fontSize: 20, color: hit ? 'var(--success, #5fb97a)' : 'var(--text-hint)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatDuration(ran)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(f.started_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · goal {formatHours(f.target_hours)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: hit ? 'var(--success, #5fb97a)' : 'var(--text-hint)', fontWeight: 600, flexShrink: 0 }}>{hit ? 'Goal met' : 'Ended early'}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Fasting() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { running, history, loading, busy, error, unavailable, start, end, discard } = useFasting();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Only tick while there's a fast to tick for.
  const isRunning = !!running;
  useEffect(() => {
    if (!isRunning) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="dashboard" initials={(profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A'} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Fasting" subtitle="Time your fasts and get told when they end" onBack={() => navigate('/dashboard')} backLabel="Back to Dashboard" />

        <div className="page-pad" style={{ maxWidth: 560 }}>
          {unavailable ? (
            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Fasting isn't switched on for this account yet. It needs a one-time database update — check back shortly.
              </div>
            </Card>
          ) : loading ? null : (
            <>
              {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
              {running
                ? <RunningPanel fast={running} nowMs={nowMs} busy={busy} onEnd={end} onDiscard={discard} />
                : <StartPanel busy={busy} onStart={start} />}
              <NotifyCard running={!!running} />
              <HistoryCard history={history} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
