// src/pages/Coach.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useTheme } from '../hooks/useTheme';
import { useMyClients, useTrainerComments, useClientFoodLogs } from '../hooks/useCoach';
import { useHistory } from '../hooks/useHistory';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { getCheckinForDate, setClientTargets, getSavedMeals, shareRecipeWithClient } from '../lib/db';
import { todayLocalDate, dateNDaysAgo, dateRange, streakFor, computeStreak } from '../lib/patterns';
import { computeTrendWeight, toKg, fromKg } from '../lib/adaptiveTDEE';
import { round1 } from '../lib/format';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import DaySelector from '../components/DaySelector';
import LogItemRow from '../components/LogItemRow';
import LogoMark from '../components/LogoMark';
import StreakItem from '../components/StreakItem';
import MicroCard from '../components/MicroCard';
import MacroPreviewBar from '../components/MacroPreviewBar';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const ACCENT = '#8fbc8f';
const WATER_BLUE = '#6aabcf';
const AI_PURPLE = '#9f97e8';
const RANGES = [{ id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }];
const GOAL_LABELS = { lose: 'Lose weight', maintain: 'Stay balanced', build: 'Build muscle' };
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
// Mirrors the section layout on the client's own Nutrients page — same
// grouping, just data-driven off MICRO_NUTRIENTS here instead of one
// hardcoded MicroCard per nutrient.
const MICRO_GROUPS = [
  { label: 'Other nutrients', keys: ['fibre', 'sodium', 'sugar'] },
  { label: 'Fat breakdown', keys: ['saturatedFat', 'transFat', 'cholesterol'] },
  { label: 'Vitamins & minerals', keys: ['addedSugar', 'potassium', 'vitaminD', 'calcium', 'iron'] },
  { label: 'More micronutrients', keys: ['vitaminA', 'vitaminC', 'vitaminB12', 'folate', 'magnesium', 'zinc', 'polyunsaturatedFat', 'monounsaturatedFat'] },
];
// Where each category routes to on the client's own app — shown as the
// picker in the composer and the tag on each posted comment.
const COMMENT_CATEGORIES = [
  { id: 'general', label: 'General', icon: 'ti-message-circle', color: 'var(--text-muted)' },
  { id: 'weight', label: 'Weight', icon: 'ti-scale', color: ACCENT },
  { id: 'nutrition', label: 'Nutrition', icon: 'ti-clipboard-list', color: WATER_BLUE },
  { id: 'checkin', label: 'Check-in', icon: 'ti-mood-smile', color: AI_PURPLE },
];

function timeOfDayGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  return code;
}

function avg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border-default)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, children }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px' }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 13 }} />}
      {children}
    </p>
  );
}

// Initials avatar with a progress ring around it — filled toward how much
// of the client's calorie target they've logged today. No target yet ==
// a plain unfilled ring, not a missing/broken-looking element.
function ClientAvatar({ name, pct, size = 44 }) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const offset = circumference * (1 - clamped);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-default)" strokeWidth={strokeWidth} />
        {clamped > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--accent)" strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: strokeWidth, borderRadius: '50%', background: 'var(--bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Syne', sans-serif",
      }}>
        {initials}
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, hint, color = ACCENT }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: value === '—' ? 'var(--border-strong)' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--border-strong)' }}>{hint}</div>
    </div>
  );
}

function EmptyChartBox({ icon, message }) {
  return (
    <div style={{ height: 180, border: '1px dashed var(--border-strong)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--border-strong)' }} />
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200 }}>{message}</div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Coach() {
  const navigate = useNavigate();
  const { profile, save: saveProfile } = useProfile();
  const { clients, loading: clientsLoading, revoke, setGroup } = useMyClients();
  const [selectedClient, setSelectedClient] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeError, setCodeError] = useState(null);

  // Rows resolve their own "logged today" status independently (see
  // ClientPreviewRow) and report it up here for both the header greeting
  // and the list's own summary line — the list itself never reorders as
  // each one resolves, which would be distracting while a trainer is
  // actively looking at it.
  const [statusById, setStatusById] = useState({});
  const reportStatus = useCallback((id, status) => {
    setStatusById(prev => ({ ...prev, [id]: status }));
  }, []);
  const resolvedStatuses = Object.values(statusById);
  const loggedTodayCount = resolvedStatuses.filter(s => s.loggedToday).length;
  const allLoggedToday = clients.length > 0 && resolvedStatuses.length === clients.length && loggedTodayCount === clients.length;

  // Coach Mode requires the pass — a direct /coach visit without it (or
  // after the pass lapses) bounces back to Settings rather than showing an
  // empty dashboard.
  useEffect(() => {
    if (profile && !profile.coach_pass) navigate('/settings');
  }, [profile, navigate]);

  if (!profile || !profile.coach_pass) return null;

  const exitCoachMode = () => {
    navigate('/dashboard');
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    setCodeError(null);
    try {
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await saveProfile({ coach_invite_code: generateInviteCode() });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err; // likely a code collision — retry with a fresh one
        }
      }
      if (lastErr) throw lastErr;
    } catch (err) {
      setCodeError(err.message || "Couldn't generate a code — try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!profile.coach_invite_code) return;
    try {
      await navigator.clipboard.writeText(profile.coach_invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — the code is still visible to copy by hand.
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={24} />
            <div>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Coach Mode
              </h2>
              <p style={{ color: 'var(--text-hint)', fontSize: 13, margin: '2px 0 0' }}>
                {selectedClient ? (selectedClient.name || 'Client') : (
                  clients.length === 0
                    ? `${timeOfDayGreeting()} — invite your first client below`
                    : resolvedStatuses.length === 0
                    ? `${timeOfDayGreeting()} — checking in on your clients…`
                    : allLoggedToday
                    ? `${timeOfDayGreeting()} — everyone's logged today`
                    : `${timeOfDayGreeting()} — ${loggedTodayCount}/${clients.length} clients logged today`
                )}
              </p>
            </div>
          </div>
          <button
            onClick={selectedClient ? () => setSelectedClient(null) : exitCoachMode}
            className="btn-press"
            style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            {selectedClient ? '← All clients' : 'Exit Coach Mode'}
          </button>
        </div>

        <div className="page-pad">
          {!selectedClient ? (
            <ClientListView
              profile={profile}
              clients={clients}
              loading={clientsLoading}
              generating={generating}
              codeError={codeError}
              copied={copied}
              onGenerate={handleGenerateCode}
              onCopy={handleCopyCode}
              onSelect={setSelectedClient}
              onRevoke={revoke}
              onSetGroup={setGroup}
              onStatus={reportStatus}
              loggedTodayCount={loggedTodayCount}
              resolvedCount={resolvedStatuses.length}
              allLoggedToday={allLoggedToday}
            />
          ) : (
            <ClientDetailView client={selectedClient} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Client list + invite code ────────────────────────────────────────────────
const INVITE_STEPS = [
  { icon: 'ti-sparkles', text: 'Generate a code' },
  { icon: 'ti-share-3', text: 'Share it with your client' },
  { icon: 'ti-link', text: 'They connect in Settings — food, weight and check-ins show up here' },
];

function ClientListView({ profile, clients, loading, generating, codeError, copied, onGenerate, onCopy, onSelect, onRevoke, onStatus, onSetGroup, loggedTodayCount, resolvedCount, allLoggedToday }) {
  const hasClients = clients.length > 0;
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
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card style={{
        marginBottom: 0,
        background: profile.coach_invite_code
          ? 'linear-gradient(160deg, var(--accent-bg) 0%, var(--bg-subtle) 65%)'
          : 'var(--bg-subtle)',
        border: `1px solid ${profile.coach_invite_code ? 'var(--border-active)' : 'var(--border-default)'}`,
      }}>
        <SectionLabel icon="ti-user-plus">{hasClients ? 'Invite another client' : 'Invite your first client'}</SectionLabel>
        {profile.coach_invite_code ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
              Share this code — a client enters it in Settings to connect their data to your dashboard.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                flex: 1, padding: '14px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-active)',
                borderRadius: 10, fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '0.14em',
                color: 'var(--accent)', textAlign: 'center',
              }}>
                {profile.coach_invite_code}
              </div>
              <button
                onClick={onCopy}
                className="btn-press"
                style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 10, color: copied ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}
                title="Copy code"
              >
                {copied ? <i className="ti ti-check pop-in" /> : <i className="ti ti-copy" />}
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 18 }}>
            {INVITE_STEPS.map((step, i) => (
              <div key={step.text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < INVITE_STEPS.length - 1 ? 14 : 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)', fontSize: 13 }}>
                  <i className={`ti ${step.icon}`} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{step.text}</p>
              </div>
            ))}
          </div>
        )}
        {codeError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{codeError}</p>}
        <button
          onClick={onGenerate}
          disabled={generating}
          className="btn-press"
          style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >
          {generating ? 'Generating…' : profile.coach_invite_code ? 'Regenerate code' : 'Generate code'}
        </button>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SectionLabel icon="ti-users">Your clients</SectionLabel>
          {hasClients && resolvedCount > 0 && (
            allLoggedToday ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>
                <i className="ti ti-circle-check" /> All caught up
              </span>
            ) : (
              <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>
                {loggedTodayCount}/{resolvedCount} logged today
              </span>
            )
          )}
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : !hasClients ? (
          <div style={{ textAlign: 'center', padding: '20px 12px' }}>
            <i className="ti ti-users" style={{ fontSize: 28, color: 'var(--border-strong)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
              Once a client redeems your invite code, they'll show up here.
            </p>
          </div>
        ) : (
          groupedClients.map(([label, rows]) => (
            <div key={label}>
              {groupedClients.length > 1 && (
                <div style={{ color: 'var(--text-hint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
                  {label} <span style={{ fontWeight: 400 }}>({rows.length})</span>
                </div>
              )}
              {rows.map((row, i) => (
                <ClientPreviewRow key={row.id} row={row} index={i} onSelect={onSelect} onRevoke={onRevoke} onStatus={onStatus} onSetGroup={onSetGroup} />
              ))}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// A client row previews today's totals plus a 7-day average, fetched
// independently per row so one slow client never blocks the rest of the list.
// The avatar ring fills toward today's share of the client's own calorie
// target, giving an at-a-glance signal without reading any numbers.
function ClientPreviewRow({ row, index, onSelect, onRevoke, onStatus, onSetGroup }) {
  const today = todayLocalDate();
  const { dailyData, loading } = useHistory(dateNDaysAgo(6), today, row.client?.id);
  const todayData = dailyData.find(d => d.date === today);
  const loggedDays = dailyData.filter(d => d.loggedMeals > 0);
  const avgCal = loggedDays.length ? Math.round(avg(loggedDays.map(d => d.calories))) : null;
  const calorieTarget = row.client?.calorie_target || null;
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
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: "'DM Sans', sans-serif",
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

// ─── Single client's dashboard ────────────────────────────────────────────────
function ClientDetailView({ client }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const today = todayLocalDate();
  const [date, setDate] = useState(today);
  const [range, setRange] = useState(7);
  const [checkin, setCheckin] = useState(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentCategory, setCommentCategory] = useState('general');
  const [open, setOpen] = useState({ breakfast: true, lunch: true, dinner: true, snacks: true });
  const [expandedId, setExpandedId] = useState(null);

  // A mutable local copy of the client's goal/target fields — resyncs from
  // the prop whenever a different client is selected, but otherwise holds
  // whatever the trainer just saved so the page reflects it immediately
  // without a full refetch of the client list.
  const [clientData, setClientData] = useState(client);
  const [editingTargets, setEditingTargets] = useState(false);
  useEffect(() => { setClientData(client); setEditingTargets(false); }, [client]);

  const handleSaveTargets = async (fields) => {
    await setClientTargets(client.id, fields);
    setClientData(prev => ({ ...prev, ...fields }));
    setEditingTargets(false);
  };

  const isLight = theme === 'light';
  const chartTextMuted = isLight ? '#6b6b6b' : '#666666';
  const chartGrid = isLight ? '#e7e7e5' : '#2a2a2a';

  const { dailyData, loading: historyLoading } = useHistory(dateNDaysAgo(range - 1), today, client.id);
  const { dailyData: badgeData } = useHistory(dateNDaysAgo(59), today, client.id);
  const { logs: weightLogs, latest: latestWeight, loading: weightLoading } = useWeightLogs(dateNDaysAgo(range - 1), today, client.id);
  const { meals, loading: foodLoading } = useClientFoodLogs(client.id, date);
  const { comments, addComment, removeComment } = useTrainerComments(client.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ci = await getCheckinForDate(client.id, date);
        if (!cancelled) setCheckin(ci);
      } catch (err) {
        console.error('Failed to load check-in:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [client.id, date]);

  const weightUnit = clientData.unit === 'imperial' ? 'lb' : 'kg';
  const calorieTarget = clientData.calorie_target || null;
  const proteinTarget = clientData.protein_g || null;

  const byDate = useMemo(() => new Map(dailyData.map(d => [d.date, d])), [dailyData]);
  const allDates = useMemo(() => dateRange(dateNDaysAgo(range - 1), today), [range, today]);
  const filledDays = allDates.map(d => byDate.get(d) || { date: d, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, loggedMeals: 0, energy: null, mood: null });
  const loggedDays = filledDays.filter(d => d.loggedMeals > 0);
  const hasData = loggedDays.length > 0;

  const avgCalories = Math.round(avg(loggedDays.map(d => d.calories)));
  const avgProtein = Math.round(avg(loggedDays.map(d => d.protein_g)));
  const daysOnTarget = calorieTarget ? loggedDays.filter(d => Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.1).length : 0;
  const energyDays = filledDays.filter(d => d.energy != null);
  const avgEnergy = energyDays.length ? avg(energyDays.map(d => d.energy)).toFixed(1) : null;

  const loggingStreak = computeStreak(badgeData);
  const calorieStreak = calorieTarget ? streakFor(badgeData, d => d.calories > 0 && Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.15) : 0;
  const moodStreak = streakFor(badgeData, d => d.mood != null);
  const proteinStreak = proteinTarget ? streakFor(badgeData, d => d.protein_g >= proteinTarget * 0.9) : 0;

  const labels = filledDays.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }));

  const calorieChartData = {
    labels,
    datasets: [
      {
        label: 'Calories', data: filledDays.map(d => d.calories || null),
        borderColor: ACCENT, backgroundColor: ACCENT + '22', fill: true, tension: 0.3, spanGaps: true,
        pointRadius: range > 30 ? 0 : 3,
      },
      ...(calorieTarget ? [{
        label: 'Goal', data: filledDays.map(() => calorieTarget),
        borderColor: chartTextMuted, borderDash: [4, 4], pointRadius: 0, fill: false,
      }] : []),
    ],
  };

  const macroChartData = {
    labels,
    datasets: [
      { label: 'Protein', data: filledDays.map(d => d.protein_g || 0), backgroundColor: ACCENT },
      { label: 'Carbs', data: filledDays.map(d => d.carbs_g || 0), backgroundColor: WATER_BLUE },
      { label: 'Fat', data: filledDays.map(d => d.fat_g || 0), backgroundColor: AI_PURPLE },
    ],
  };

  const trendPoints = useMemo(() => computeTrendWeight(weightLogs), [weightLogs]);
  const trendByDate = useMemo(() => new Map(trendPoints.map(p => [p.date, p.trend])), [trendPoints]);
  const weightLabels = weightLogs.map(w => new Date(w.logged_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }));
  const weightChartData = {
    labels: weightLabels,
    datasets: [
      {
        label: 'Weight', data: weightLogs.map(w => Math.round(fromKg(toKg(w.weight, w.unit), weightUnit) * 10) / 10),
        borderColor: ACCENT, backgroundColor: ACCENT + '22', fill: true, tension: 0.3, spanGaps: true,
        pointRadius: weightLogs.length > 60 ? 0 : 3,
      },
      {
        label: 'Trend',
        data: weightLogs.map(w => {
          const t = trendByDate.get(w.logged_date);
          return t != null ? Math.round(fromKg(t, weightUnit) * 10) / 10 : null;
        }),
        borderColor: WATER_BLUE, backgroundColor: 'transparent', fill: false, tension: 0.3, spanGaps: true,
        pointRadius: 0, borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: chartTextMuted, boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTextMuted, font: { size: 10 } }, grid: { color: chartGrid } },
    },
  };
  const stackedOptions = {
    ...chartOptions,
    scales: {
      x: { ...chartOptions.scales.x, stacked: true },
      y: { ...chartOptions.scales.y, stacked: true },
    },
  };

  const handleAddComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    setCommentBody('');
    await addComment(body, date, commentCategory);
  };

  // A plain, printable summary — opened in a new tab so the browser's own
  // print dialog (Save as PDF works everywhere, no library needed) can
  // export or print it. Light background regardless of app theme, since
  // that's what prints legibly and cheaply on paper.
  const handlePrintReport = () => {
    const rangeLabel = RANGES.find(r => r.id === range)?.label || `${range} days`;
    const win = window.open('', '_blank');
    if (!win) return;
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clientName = esc(clientData.name || 'Client');
    const row = (label, value) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e5e5;"><span style="color:#666;">${label}</span><span style="font-weight:600;">${value}</span></div>`;
    win.document.write(`
      <!doctype html><html><head><title>${clientName} — Nutrition Report</title>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, 'DM Sans', sans-serif; color: #111; padding: 40px; max-width: 640px; margin: 0 auto; }
        h1 { font-family: Georgia, serif; font-size: 22px; margin: 0 0 4px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 28px 0 10px; }
        .sub { color: #777; font-size: 13px; margin-bottom: 24px; }
      </style></head>
      <body>
        <h1>${clientName} — Nutrition Report</h1>
        <div class="sub">${rangeLabel} · generated ${new Date().toLocaleDateString()}</div>
        <h2>Goal &amp; targets</h2>
        ${row('Goal', GOAL_LABELS[clientData.goal] || '—')}
        ${row('Calorie target', calorieTarget ? `${calorieTarget.toLocaleString()} kcal` : '—')}
        ${row('Protein', clientData.protein_g ? `${clientData.protein_g}g` : '—')}
        ${row('Carbs', clientData.carbs_g ? `${clientData.carbs_g}g` : '—')}
        ${row('Fat', clientData.fat_g ? `${clientData.fat_g}g` : '—')}
        <h2>Summary — ${rangeLabel}</h2>
        ${row('Average calories', hasData ? avgCalories.toLocaleString() : 'No data')}
        ${row('Average protein', hasData ? `${avgProtein}g` : 'No data')}
        ${row('Days on target', calorieTarget ? `${daysOnTarget} of ${loggedDays.length} logged days` : '—')}
        ${row('Average energy (check-ins)', avgEnergy || '—')}
        ${row('Latest weight', latestWeight ? `${latestWeight.weight}${latestWeight.unit}` : '—')}
        <h2>Streaks</h2>
        ${row('Logging streak', `${loggingStreak} days`)}
        ${row('Calorie target streak', `${calorieStreak} days`)}
        ${row('Protein target streak', `${proteinStreak} days`)}
        ${row('Mood check-in streak', `${moodStreak} days`)}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  // Full micronutrient breakdown for the selected day — same nutrient
  // list and card as the client's own Nutrients page, just summed from
  // the read-only meals already loaded for the food log above instead of
  // a second fetch.
  const microTotals = useMemo(() => {
    const totals = {};
    for (const n of MICRO_NUTRIENTS) totals[n.key] = 0;
    for (const items of Object.values(meals)) {
      for (const item of items) {
        for (const n of MICRO_NUTRIENTS) totals[n.key] += Number(item[n.key]) || 0;
      }
    }
    return totals;
  }, [meals]);
  const microTargets = clientData.micro_targets || {};
  const hasAnyFood = Object.values(meals).some(items => items.length > 0);

  return (
    <div>
      {/* Goal & targets + stat cards */}
      <div className="grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <SectionLabel icon="ti-target">Goal &amp; targets</SectionLabel>
            {!editingTargets && (
              <button
                onClick={() => setEditingTargets(true)}
                className="btn-press"
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 18, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ti ti-pencil" style={{ fontSize: 12 }} /> Edit
              </button>
            )}
          </div>
          {editingTargets ? (
            <TargetsForm client={clientData} onSave={handleSaveTargets} onCancel={() => setEditingTargets(false)} />
          ) : (
            <>
              <StatRow label="Goal" value={GOAL_LABELS[clientData.goal] || '—'} />
              <StatRow label="Calorie target" value={calorieTarget ? `${calorieTarget.toLocaleString()} kcal` : '—'} />
              <StatRow label="Protein" value={clientData.protein_g ? `${clientData.protein_g}g` : '—'} />
              <StatRow label="Carbs" value={clientData.carbs_g ? `${clientData.carbs_g}g` : '—'} />
              <StatRow label="Fat" value={clientData.fat_g ? `${clientData.fat_g}g` : '—'} />
            </>
          )}
        </Card>
        <div className="grid-2" style={{ gap: 12 }}>
          <StatCard label="Avg. calories" value={hasData ? avgCalories.toLocaleString() : '—'} hint={hasData ? `over ${loggedDays.length} logged days` : 'No data yet'} color={ACCENT} />
          <StatCard label="Days on target" value={hasData && calorieTarget ? daysOnTarget : '—'} hint={calorieTarget ? 'within 10% of goal' : 'No calorie target set'} color={ACCENT} />
          <StatCard label="Avg. protein" value={hasData ? `${avgProtein}g` : '—'} hint={hasData ? `over ${loggedDays.length} logged days` : 'No data yet'} color={WATER_BLUE} />
          <StatCard label="Avg. energy" value={avgEnergy || '—'} hint={avgEnergy ? `over ${energyDays.length} check-ins` : 'No check-ins yet'} color={AI_PURPLE} />
        </div>
      </div>

      {/* range toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className="btn-press"
              style={{
                background: range === r.id ? 'var(--accent-bg)' : 'var(--bg-card)',
                border: `1px solid ${range === r.id ? 'var(--accent-dark)' : 'var(--border-strong)'}`,
                borderRadius: 8, padding: '7px 18px', fontSize: 13,
                color: range === r.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={handlePrintReport}
          className="btn-press"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >
          <i className="ti ti-printer" style={{ fontSize: 14 }} /> Print report
        </button>
      </div>

      {/* charts */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-chart-line">Calories vs goal</SectionLabel>
          {historyLoading ? null : hasData ? (
            <div style={{ height: 200 }}><Line data={calorieChartData} options={chartOptions} /></div>
          ) : (
            <EmptyChartBox icon="ti-chart-line" message="No logged days in this range" />
          )}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-chart-bar">Macro breakdown</SectionLabel>
          {historyLoading ? null : hasData ? (
            <div style={{ height: 200 }}><Bar data={macroChartData} options={stackedOptions} /></div>
          ) : (
            <EmptyChartBox icon="ti-chart-bar" message="No logged days in this range" />
          )}
        </Card>
      </div>

      {/* weight chart */}
      <Card>
        <SectionLabel icon="ti-scale">Weight</SectionLabel>
        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, fontFamily: "'Syne', sans-serif", marginBottom: 12 }}>
          {latestWeight ? `${latestWeight.weight}${latestWeight.unit}` : '—'}
        </div>
        {weightLoading ? null : weightLogs.length > 1 ? (
          <div style={{ height: 200 }}><Line data={weightChartData} options={chartOptions} /></div>
        ) : (
          <EmptyChartBox icon="ti-scale" message="Not enough weight entries in this range" />
        )}
      </Card>

      {/* streaks */}
      <Card>
        <SectionLabel icon="ti-flame">Streaks</SectionLabel>
        {[
          { icon: 'ti-flame', iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)', name: 'Logging streak', count: loggingStreak },
          { icon: 'ti-target', iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)', name: 'Calorie target', count: calorieStreak },
          { icon: 'ti-meat', iconBg: WATER_BLUE + '18', iconColor: 'var(--water-blue)', name: 'Protein target', count: proteinStreak },
          { icon: 'ti-mood-smile', iconBg: AI_PURPLE + '18', iconColor: 'var(--ai-purple)', name: 'Mood check-ins', count: moodStreak },
        ].map((s, i, arr) => (
          <div key={s.name} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
            <StreakItem {...s} />
          </div>
        ))}
      </Card>

      {/* day-specific: food log + check-in + comments */}
      <div style={{ margin: '20px 0 16px' }}>
        <DaySelector selectedDate={date} onSelect={(d) => { setDate(d); setExpandedId(null); }} />
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-clipboard-list">Food log — {date}</SectionLabel>
          {foodLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(meals).map(([mealKey, items]) => {
                const mealTotal = Math.round(items.reduce((s, i) => s + i.cal, 0));
                const mealProtein = round1(items.reduce((s, i) => s + i.protein, 0));
                const mealCarbs = round1(items.reduce((s, i) => s + i.carbs, 0));
                const mealFat = round1(items.reduce((s, i) => s + i.fat, 0));
                const isOpen = open[mealKey];
                return (
                  <div key={mealKey} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden' }}>
                    <button onClick={() => setOpen(o => ({ ...o, [mealKey]: !o[mealKey] }))} className="btn-press" style={{ width: '100%', background: 'none', border: 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-secondary)' }}>{MEAL_LABELS[mealKey]}</div>
                        {items.length > 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>P {mealProtein}g · C {mealCarbs}g · F {mealFat}g</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{mealTotal} kcal</span>
                        <span style={{ color: 'var(--border-strong)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border-default)' }}>
                        {items.length === 0 ? (
                          <p style={{ color: 'var(--text-hint)', fontSize: 13, padding: '14px 18px' }}>Nothing logged</p>
                        ) : (
                          items.map(item => (
                            <LogItemRow
                              key={item.id}
                              item={item}
                              isExpanded={expandedId === item.id}
                              onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
                              readOnly
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div>
          <Card>
            <SectionLabel icon="ti-mood-smile">Check-in — {date}</SectionLabel>
            {checkin ? (
              <>
                <StatRow label="Mood" value={checkin.mood || '—'} />
                <StatRow label="Energy" value={checkin.energy ? `${checkin.energy}/10` : '—'} />
                <StatRow label="Water" value={`${checkin.water_glasses || 0} glasses`} />
                {checkin.note && <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '10px 0 0' }}>{checkin.note}</p>}
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No check-in logged this day.</p>
            )}
          </Card>

          <RecipeShareCard trainerId={user?.id} client={clientData} />

          <Card style={{ marginBottom: 0 }}>
            <SectionLabel icon="ti-message-circle">Comments</SectionLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {COMMENT_CATEGORIES.map(cat => {
                const selected = commentCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCommentCategory(cat.id)}
                    className="btn-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20,
                      background: selected ? cat.color + '22' : 'var(--bg-primary)',
                      border: `1px solid ${selected ? cat.color : 'var(--border-default)'}`,
                      color: selected ? cat.color : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <i className={`ti ${cat.icon}`} style={{ fontSize: 12 }} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder={`Leave a note for ${clientData.name || 'this client'}…`}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={handleAddComment}
                disabled={!commentBody.trim()}
                className="btn-press"
                style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
              >
                Post
              </button>
            </div>
            {comments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No comments yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {comments.map(c => {
                  const fromClient = c.sender_role === 'client';
                  const cat = COMMENT_CATEGORIES.find(x => x.id === c.category) || COMMENT_CATEGORIES[0];
                  return (
                    <div key={c.id} className="stagger-item" style={{ display: 'flex', justifyContent: fromClient ? 'flex-start' : 'flex-end', gap: 8 }}>
                      {!fromClient && (
                        <button
                          onClick={() => removeComment(c.id)}
                          className="btn-press"
                          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 13, flexShrink: 0, alignSelf: 'flex-end', padding: 4 }}
                          title="Delete"
                        >
                          <i className="ti ti-trash" />
                        </button>
                      )}
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px',
                        background: fromClient ? 'var(--bg-primary)' : 'var(--accent-bg)',
                        border: `1px solid ${fromClient ? 'var(--border-default)' : 'var(--border-active)'}`,
                        borderRadius: fromClient ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                      }}>
                        {!fromClient && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                            <i className={`ti ${cat.icon}`} style={{ fontSize: 11, color: cat.color }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.label}</span>
                          </div>
                        )}
                        <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{c.body}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '4px 0 0', textAlign: fromClient ? 'left' : 'right' }}>
                          {c.comment_date ? `On ${c.comment_date} · ` : ''}{new Date(c.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* micronutrients */}
      <Card style={{ marginBottom: 0 }}>
        <SectionLabel icon="ti-apple">Micronutrients — {date}</SectionLabel>
        {foodLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : !hasAnyFood ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing logged this day.</p>
        ) : (
          MICRO_GROUPS.map((group, gi) => (
            <div key={group.label} style={{ marginBottom: gi < MICRO_GROUPS.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{group.label}</div>
              <div className="grid-3">
                {group.keys.map(key => {
                  const n = MICRO_NUTRIENTS.find(m => m.key === key);
                  return (
                    <MicroCard
                      key={key}
                      icon={n.icon}
                      label={n.label}
                      value={n.unit === 'g' || n.unit === 'mg' ? round1(microTotals[key]) : Math.round(microTotals[key])}
                      unit={n.unit}
                      guideline={n.guideline}
                      target={microTargets[key]}
                      defaultTarget={n.defaultTarget}
                      color={n.color}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ─── Trainer-editable calorie/macro targets ───────────────────────────────────
const fieldStyle = { width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

function TargetsForm({ client, onSave, onCancel }) {
  const [calorieTarget, setCalorieTarget] = useState(client.calorie_target ?? '');
  const [proteinG, setProteinG] = useState(client.protein_g ?? '');
  const [carbsG, setCarbsG] = useState(client.carbs_g ?? '');
  const [fatG, setFatG] = useState(client.fat_g ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Live preview as the trainer types — protein/carbs at 4 kcal/g, fat at
  // 9 kcal/g, each bar's share relative to the macros' own calorie total
  // (not the separately-typed calorie target, which the trainer may not
  // have reconciled to the gram values yet).
  const proteinCal = Math.round((Number(proteinG) || 0) * 4);
  const carbsCal = Math.round((Number(carbsG) || 0) * 4);
  const fatCal = Math.round((Number(fatG) || 0) * 9);
  const macroCalTotal = proteinCal + carbsCal + fatCal;
  const hasMacros = macroCalTotal > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        calorie_target: calorieTarget === '' ? null : Number(calorieTarget),
        protein_g: proteinG === '' ? null : Number(proteinG),
        carbs_g: carbsG === '' ? null : Number(carbsG),
        fat_g: fatG === '' ? null : Number(fatG),
      });
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Calorie target (kcal)</label>
        <input type="number" min="0" value={calorieTarget} onChange={e => setCalorieTarget(e.target.value)} style={fieldStyle} />
      </div>
      <div className="grid-3-fixed" style={{ marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Protein (g)</label>
          <input type="number" min="0" value={proteinG} onChange={e => setProteinG(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Carbs (g)</label>
          <input type="number" min="0" value={carbsG} onChange={e => setCarbsG(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Fat (g)</label>
          <input type="number" min="0" value={fatG} onChange={e => setFatG(e.target.value)} style={fieldStyle} />
        </div>
      </div>
      {hasMacros && (
        <div style={{ marginBottom: 6 }}>
          <MacroPreviewBar label="Protein" grams={Number(proteinG) || 0} calories={proteinCal} pct={proteinCal / macroCalTotal} color="var(--accent)" />
          <MacroPreviewBar label="Carbs" grams={Number(carbsG) || 0} calories={carbsCal} pct={carbsCal / macroCalTotal} color="var(--water-blue)" />
          <MacroPreviewBar label="Fat" grams={Number(fatG) || 0} calories={fatCal} pct={fatCal / macroCalTotal} color="var(--ai-purple)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '2px 0 0' }}>
            Adds up to {macroCalTotal.toLocaleString()} kcal from macros
            {calorieTarget !== '' && Math.abs(macroCalTotal - Number(calorieTarget)) > Number(calorieTarget) * 0.05
              ? ` — doesn't quite match the ${Number(calorieTarget).toLocaleString()} kcal target above`
              : ''}
          </p>
        </div>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-press"
          style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        <button
          onClick={onCancel}
          className="btn-press"
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Share a recipe ────────────────────────────────────────────────────────
// Copies one of the trainer's own saved meals into the client's saved
// meals — reuses whatever recipes the trainer already has from using the
// app themselves, rather than building a whole second recipe editor.
function RecipeShareCard({ trainerId, client }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState(null); // null | 'done' | error string

  useEffect(() => {
    let cancelled = false;
    if (!trainerId) return;
    setLoading(true);
    getSavedMeals(trainerId)
      .then(result => { if (!cancelled) setMeals(result); })
      .catch(err => { console.error('Failed to load saved meals:', err); if (!cancelled) setMeals([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trainerId]);

  const handleShare = async () => {
    const meal = meals.find(m => m.id === selectedId);
    if (!meal) return;
    setSharing(true);
    setStatus(null);
    try {
      await shareRecipeWithClient(client.id, meal.name, meal.items);
      setStatus('done');
      setSelectedId('');
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus(err.message || "Couldn't share — try again.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card>
      <SectionLabel icon="ti-tools-kitchen-2">Share a recipe</SectionLabel>
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
      ) : meals.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          You don't have any saved meals yet — create one from Food Search, then share it with {client.name || 'this client'} here.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Choose a saved meal…</option>
              {meals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button
              onClick={handleShare}
              disabled={!selectedId || sharing}
              className="btn-press"
              style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
            >
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </div>
          {status === 'done' && <p style={{ color: 'var(--accent)', fontSize: 12, margin: 0 }}>Shared — it's now in their saved meals.</p>}
          {status && status !== 'done' && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{status}</p>}
        </>
      )}
    </Card>
  );
}
