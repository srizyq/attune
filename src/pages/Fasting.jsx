import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFasting } from '../hooks/useFasting';
import { useFastEndNotifications } from '../hooks/useReminders';
import { pushSupported } from '../lib/pushNotifications';
import {
  FAST_PRESETS, DEFAULT_FAST_HOURS, MIN_FAST_HOURS, MAX_FAST_HOURS, EXTEND_STEP_HOURS, FAST_STAGES,
  parseTargetHours, fastEndsAt, fastProgress, formatClock, formatDuration, formatHours, hitGoal,
  fastStage, extendedTarget, fastStreak, weekSummary,
} from '../lib/fasting';
import AppNav from '../components/AppNav';
import PageHeader from '../components/PageHeader';
import { FieldRow, Toggle } from '../components/settings/primitives';
import { ScanCard, Eyebrow, Chip, PillButton, PillRow, PrimaryButton, GhostButton } from '../components/scan/ScanKit';

const RING_SIZE = 220;
const RING_STROKE = 14;
const FONT = "'Plus Jakarta Sans', sans-serif";
const GOOD = 'var(--success, #5fb97a)';

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
    <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, margin: '4px auto 14px', maxWidth: '100%', aspectRatio: '1' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--chip-bg)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
          stroke={done ? GOOD : 'var(--accent)'} strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28 }}>
        {children}
      </div>
    </div>
  );
}

function StreakChip({ streak }) {
  if (streak < 1) return null;
  return <Chip color="#e8a33d" icon="ti-flame">{streak} day streak</Chip>;
}

// 12:12 … 20:4 plus Custom. `value` is the chosen hours; Custom opens a box.
// With `confirmCustom` a typed length is only applied by its "Set goal" button
// (for a running fast, where each keystroke must not rewrite the goal).
function ProtocolPicker({ value, onPick, label = 'Fasting protocol', disabled = false, confirmCustom = false }) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const isPreset = FAST_PRESETS.some((p) => p.hours === Number(value));
  return (
    <>
      <PillRow label={label} wrap>
        {FAST_PRESETS.map((p) => (
          <PillButton key={p.hours} disabled={disabled} active={!custom && Number(value) === p.hours} onClick={() => { setCustom(false); onPick(p.hours); }}>
            {p.label}
          </PillButton>
        ))}
        <PillButton disabled={disabled} active={custom || !isPreset} onClick={() => { setCustom(true); if (!confirmCustom) onPick(parseTargetHours(text)); }}>Custom</PillButton>
      </PillRow>
      {custom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <input
            type="number" inputMode="decimal" min={MIN_FAST_HOURS} max={MAX_FAST_HOURS} step="0.5" autoFocus
            value={text} onChange={(e) => { setText(e.target.value); if (!confirmCustom) onPick(parseTargetHours(e.target.value)); }} placeholder="Hours"
            aria-label="Fast length in hours"
            style={{ width: 100, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          {confirmCustom && (
            <PillButton disabled={disabled || parseTargetHours(text) == null} onClick={() => onPick(parseTargetHours(text))}>Set goal</PillButton>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{MIN_FAST_HOURS}–{MAX_FAST_HOURS} hours</span>
        </div>
      )}
    </>
  );
}

function StartPanel({ busy, streak, onStart }) {
  const [hours, setHours] = useState(DEFAULT_FAST_HOURS); // null while the custom box holds something invalid
  return (
    <ScanCard style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Eyebrow>Start a fast</Eyebrow>
        <StreakChip streak={streak} />
      </div>
      <Ring pct={0} done={false}>
        <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{hours == null ? '–' : formatHours(hours)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {hours == null ? 'Enter a length' : hours < 24 ? `fast · ${formatHours(24 - hours)} eating window` : 'fast'}
        </div>
      </Ring>
      <ProtocolPicker value={hours} onPick={setHours} />
      <PrimaryButton style={{ marginTop: 18 }} disabled={busy || hours == null} onClick={() => onStart(hours)}>
        <i className="ti ti-player-play" aria-hidden="true" />
        {busy ? 'Starting…' : hours == null ? 'Enter a length' : `Start ${formatHours(hours)} fast`}
      </PrimaryButton>
    </ScanCard>
  );
}

// "Where you might be" — a rough guide, never a measurement.
function StageCard({ elapsedMs }) {
  const s = fastStage(elapsedMs);
  return (
    <ScanCard>
      <Eyebrow style={{ marginBottom: 10 }}>Where you might be</Eyebrow>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 13, background: 'var(--accent-bg)', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          <i className={`ti ${s.icon}`} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }} data-testid="fast-stage">{s.title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', marginTop: 2, overflowWrap: 'anywhere' }}>{s.note}</div>
        </div>
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 4, margin: '14px 0 8px' }}>
        {FAST_STAGES.map((st, i) => (
          <span key={st.key} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= s.index ? 'var(--accent)' : 'var(--chip-bg)' }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {s.next ? <>Next: {s.next.title} in {formatDuration(s.untilNextMs)}. </> : null}
        A rough guide only — everyone's different.
      </div>
    </ScanCard>
  );
}

function RunningPanel({ fast, nowMs, busy, streak, onEnd, onDiscard, onSetTarget }) {
  const [confirming, setConfirming] = useState(null); // null | 'end' | 'discard'
  const p = fastProgress(fast, nowMs);
  const ends = fastEndsAt(fast);
  const canExtend = Number(fast.target_hours) < MAX_FAST_HOURS;

  return (
    <>
      <ScanCard style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Eyebrow>{p.done ? 'Goal reached' : 'Fasting'}</Eyebrow>
          <StreakChip streak={streak} />
        </div>
        <Ring pct={p.pct} done={p.done}>
          <div style={{ fontFamily: FONT, fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }} aria-label="Time fasted">
            {formatClock(p.elapsedMs)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>of your {formatHours(fast.target_hours)} goal</div>
        </Ring>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
          {p.done
            ? <>You hit your goal {formatDuration(p.overMs) === '0m' ? 'just now' : `${formatDuration(p.overMs)} ago`}. Eat when you're ready.</>
            : <>{formatDuration(p.remainingMs)} to go · ends {timeLabel(ends, nowMs)}</>}
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Started {timeLabel(new Date(fast.started_at), nowMs)}</div>
        </div>

        <Eyebrow style={{ marginBottom: 8 }}>Change goal</Eyebrow>
        <ProtocolPicker value={fast.target_hours} onPick={(h) => { if (h != null && h !== Number(fast.target_hours)) onSetTarget(h); }} disabled={busy} label="Change goal" confirmCustom />
        {canExtend && (
          <GhostButton style={{ marginTop: 8, paddingLeft: 0 }} disabled={busy} onClick={() => onSetTarget(extendedTarget(fast.target_hours))}>
            <i className="ti ti-plus" aria-hidden="true" /> {EXTEND_STEP_HOURS} more hours
          </GhostButton>
        )}
      </ScanCard>

      <StageCard elapsedMs={p.elapsedMs} />

      <ScanCard>
        {confirming === 'end' && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
            End now, {formatDuration(p.remainingMs)} short of your goal?
          </div>
        )}
        {confirming === 'discard' && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
            Discard this fast? It won't be saved to your history.
          </div>
        )}
        {confirming === 'end' && (
          <>
            <PrimaryButton disabled={busy} onClick={onEnd}><i className="ti ti-player-stop" aria-hidden="true" />{busy ? 'Ending…' : 'Yes, end fast'}</PrimaryButton>
            <GhostButton style={{ width: '100%', marginTop: 4 }} onClick={() => setConfirming(null)}>Keep fasting</GhostButton>
          </>
        )}
        {confirming === 'discard' && (
          <>
            <PrimaryButton disabled={busy} style={{ background: 'var(--danger)', color: '#fff' }} onClick={onDiscard}><i className="ti ti-trash" aria-hidden="true" />{busy ? 'Discarding…' : 'Yes, discard'}</PrimaryButton>
            <GhostButton style={{ width: '100%', marginTop: 4 }} onClick={() => setConfirming(null)}>Keep it</GhostButton>
          </>
        )}
        {confirming == null && (
          <>
            <PrimaryButton disabled={busy} onClick={() => (p.done ? onEnd() : setConfirming('end'))}>
              <i className="ti ti-player-stop" aria-hidden="true" />{busy ? 'Ending…' : 'End fast'}
            </PrimaryButton>
            <GhostButton style={{ width: '100%', marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }} onClick={() => setConfirming('discard')}>
              Started by mistake? Discard
            </GhostButton>
          </>
        )}
      </ScanCard>
    </>
  );
}

// Seven circles, today last: filled when the goal was met, ringed when a fast
// ended short of it, dashed when there was none.
function WeekCard({ history, nowMs }) {
  const w = weekSummary(history, nowMs);
  return (
    <ScanCard>
      <Eyebrow style={{ marginBottom: 12 }}>This week</Eyebrow>
      <div style={{ display: 'flex', gap: 6 }} data-testid="fast-week">
        {w.days.map((d) => {
          const state = d.hit ? 'met' : d.fasted ? 'short' : 'none';
          const label = `${d.date.toLocaleDateString('en-AU', { weekday: 'long' })}: ${state === 'met' ? 'goal met' : state === 'short' ? 'ended early' : 'no fast'}`;
          return (
            <div key={d.key} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
              <div
                role="img" aria-label={label} data-state={state}
                style={{
                  width: '100%', maxWidth: 40, aspectRatio: '1', margin: '0 auto', borderRadius: '50%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  background: state === 'met' ? GOOD : 'transparent',
                  color: '#fff',
                  border: state === 'met' ? 'none' : state === 'short' ? '2px solid var(--accent)' : '2px dashed var(--border-default)',
                  outline: d.isToday ? '2px solid var(--accent-border)' : 'none', outlineOffset: 2,
                }}
              >
                {state === 'met' && <i className="ti ti-check" aria-hidden="true" />}
              </div>
              <div style={{ fontSize: 11, fontWeight: d.isToday ? 800 : 600, color: d.isToday ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 6 }}>
                {d.date.toLocaleDateString('en-AU', { weekday: 'narrow' })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Chip icon="ti-target">Goal met {w.hitCount} of 7 days</Chip>
        {w.avgMs > 0 && <Chip icon="ti-clock">Average {formatDuration(w.avgMs)}</Chip>}
      </div>
    </ScanCard>
  );
}

function NotifyCard() {
  const notifs = useFastEndNotifications();
  const [error, setError] = useState(null);
  return (
    <ScanCard>
      <FieldRow label="Notify me when my fast ends">
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
    </ScanCard>
  );
}

const RECENT_FASTS = 10;

function HistoryCard({ history }) {
  const recent = history.slice(0, RECENT_FASTS);
  return (
    <ScanCard>
      <Eyebrow style={{ marginBottom: 6 }}>Recent fasts</Eyebrow>
      {recent.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, paddingTop: 6 }}>Fasts you finish will show up here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {recent.map((f, i) => {
            const hit = hitGoal(f);
            const ran = fastProgress(f, new Date(f.ended_at).getTime()).elapsedMs;
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-default)' }}>
                <i className={`ti ${hit ? 'ti-circle-check' : 'ti-circle-dashed'}`} aria-hidden="true" style={{ fontSize: 20, color: hit ? GOOD : 'var(--text-hint)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatDuration(ran)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(f.started_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · goal {formatHours(f.target_hours)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: hit ? GOOD : 'var(--text-hint)', fontWeight: 600, flexShrink: 0 }}>{hit ? 'Goal met' : 'Ended early'}</div>
              </div>
            );
          })}
        </div>
      )}
    </ScanCard>
  );
}

export default function Fasting() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { running, history, loading, busy, error, unavailable, start, end, discard, setTarget } = useFasting();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Only tick while there's a fast to tick for.
  const isRunning = !!running;
  useEffect(() => {
    if (!isRunning) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const streak = fastStreak(history, nowMs);

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: FONT, color: 'var(--text-primary)' }}>
      <AppNav active="dashboard" initials={(profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A'} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Fasting" onBack={() => navigate('/dashboard')} backLabel="Back to Dashboard" />

        <div className="page-pad" style={{ maxWidth: 560 }}>
          {unavailable ? (
            <ScanCard style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Fasting isn't switched on for this account yet. It needs a one-time database update — check back shortly.
              </div>
            </ScanCard>
          ) : loading ? null : (
            <>
              {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
              {running
                ? <RunningPanel fast={running} nowMs={nowMs} busy={busy} streak={streak} onEnd={end} onDiscard={discard} onSetTarget={setTarget} />
                : <StartPanel busy={busy} streak={streak} onStart={start} />}
              <WeekCard history={history} nowMs={nowMs} />
              <NotifyCard />
              <HistoryCard history={history} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
