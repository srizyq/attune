import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import { hourToHHMM } from '../lib/mealTime';
import AppNav from '../components/AppNav';
import CoachNote from '../components/CoachNote';
import { useCoachNote } from '../hooks/useCoach';
import LogItemRow from '../components/LogItemRow';
import HourlyTimeline from '../components/HourlyTimeline';
import DaySelector from '../components/DaySelector';
import DailyLogViewToggle from '../components/DailyLogViewToggle';
import CopyDayModal from '../components/CopyDayModal';
import Toast from '../components/Toast';
import { round1 } from '../lib/format';
import { useCopyYesterday } from '../hooks/useCopyYesterday';
import YesterdayMealPrompt from '../components/YesterdayMealPrompt';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export default function DailyLog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, save: saveProfile } = useProfile();
  const isPremium = !!profile?.is_premium;
  // Defaults to hourly (unset) — the only view that ever existed for Pro
  // before this was a choice at all, so an existing Pro user's daily log
  // doesn't change out from under them just because this shipped.
  const dailyLogView = profile?.daily_log_view || 'hourly';
  const showHourly = isPremium && dailyLogView === 'hourly';
  const [viewSaveError, setViewSaveError] = useState(null);
  async function handleViewChange(v) {
    setViewSaveError(null);
    try { await saveProfile({ daily_log_view: v }); } catch { setViewSaveError("Couldn't save — try again."); }
  }
  const today = todayLocalDate();
  // No current caller passes a date here (Progress's calendar now opens
  // the past-day Dashboard instead), but AppNav's "Daily log" bottom-nav
  // icon is present on this page too — a same-route re-navigation
  // wouldn't re-run this initializer, so a future caller relying on it
  // would silently no-op exactly like Scan menu did on /food. Resyncing
  // on every location.state change instead of only at mount avoids that
  // regardless of who calls it next.
  const [selectedDate, setSelectedDate] = useState(() => {
    const requested = location.state?.date;
    return requested && requested <= today ? requested : today;
  });
  useEffect(() => {
    const requested = location.state?.date;
    if (requested && requested <= today) setSelectedDate(requested);
  }, [location.state, today]);
  const isToday = selectedDate === today;
  const { note: nutritionCoachNote, dismiss: dismissNutritionCoachNote } = useCoachNote('nutrition', selectedDate);
  const { meals, dayTimeline, loading, deleteFood, updateFood, refetch } = useFoodLogs(selectedDate);
  const [open, setOpen] = useState({ breakfast: true, lunch: true, dinner: true, snacks: true });
  const [expandedId, setExpandedId] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const [toastAction, setToastAction] = useState(null);
  function showToast(message, isError = false, action = null) {
    setToast(message);
    setToastError(isError);
    setToastAction(action);
  }

  const { byMeal: yesterdayByMeal, copy: copyFromYesterday, copying: copyingYesterday } = useCopyYesterday(selectedDate, refetch, showToast);

  // deleteFood had no error handling anywhere it was used — a failed
  // delete (network blip, RLS hiccup) just silently did nothing, no toast,
  // no console hint. LogItemRow already catches and inline-surfaces its
  // own onSave failures (see its `error` state), so only delete needs
  // this; wrapping once here reaches every call site below (the
  // meal-grouped view's LogItemRow rows and HourlyTimeline's own, which
  // renders LogItemRow internally) without changing either component,
  // same as FoodSearch.jsx's showToast pattern for its own write paths
  // (c8e1eed).
  async function handleDeleteItem(id) {
    try {
      await deleteFood(id);
    } catch {
      showToast("Couldn't delete — try again", true);
    }
  }

  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const totalCal = Object.values(meals).flat().reduce((s, i) => s + i.cal, 0);
  const dateStr = isToday
    ? 'Today'
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, display: 'flex', flexShrink: 0 }}>
            <i className="ti ti-arrow-left" />
          </button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>Daily log</span>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
            <button onClick={() => setShowCopyMenu(v => !v)} title="Copy meals" aria-label="Copy meals" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 17, display: 'flex', padding: 4 }}>
              <i className="ti ti-copy" />
            </button>
            {showCopyMenu && (
              <>
                <div onClick={() => setShowCopyMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 41, minWidth: 210, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                  <button onClick={() => { setShowCopyMenu(false); copyFromYesterday(); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>Copy yesterday</button>
                  <button onClick={() => { setShowCopyMenu(false); setShowCopyModal(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>Copy from another day…</button>
                </div>
              </>
            )}
          </div>
          {isPremium ? (
            <DailyLogViewToggle value={dailyLogView} onChange={handleViewChange} />
          ) : (
            <div title="Hourly timeline — a Pro feature" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '5px 12px', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
              <i className="ti ti-lock" style={{ fontSize: 12 }} /> <span className="hide-on-narrow">Hourly timeline (Pro)</span>
            </div>
          )}
        </div>

        <div className="page-pad" style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 20 }}>
            <DaySelector selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setExpandedId(null); }} />
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateStr}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(totalCal).toLocaleString()} kcal logged</div>
            </div>
            {viewSaveError && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{viewSaveError}</p>}
          </div>

          {nutritionCoachNote && <CoachNote note={nutritionCoachNote} onDismiss={dismissNutritionCoachNote} style={{ marginBottom: 20 }} />}

          {loading ? null : showHourly ? (
            <HourlyTimeline
              segments={dayTimeline}
              onDelete={handleDeleteItem}
              onSave={updateFood}
              onNavigateAdd={(hour) => navigate('/food', { state: { date: selectedDate, presetTime: hourToHHMM(hour) } })}
              emptyMessage={isToday ? 'Nothing logged today yet.' : 'Nothing logged this day.'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(meals).map(([mealKey, items]) => {
                const mealTotal = Math.round(items.reduce((s, i) => s + i.cal, 0));
                const mealProtein = round1(items.reduce((s, i) => s + i.protein, 0));
                const mealCarbs = round1(items.reduce((s, i) => s + i.carbs, 0));
                const mealFat = round1(items.reduce((s, i) => s + i.fat, 0));
                const isOpen = open[mealKey];
                return (
                  <div key={mealKey} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, overflow: 'hidden' }}>
                    <button onClick={() => setOpen(o => ({ ...o, [mealKey]: !o[mealKey] }))} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-secondary)' }}>{MEAL_LABELS[mealKey]}</div>
                        {items.length > 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>P {mealProtein}g · C {mealCarbs}g · F {mealFat}g</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{mealTotal} kcal</span>
                        <span style={{ color: 'var(--text-hint)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </div>
                    </button>
                    {items.length === 0 && yesterdayByMeal[mealKey].length > 0 && (
                      <YesterdayMealPrompt
                        mealLabel={MEAL_LABELS[mealKey]}
                        names={yesterdayByMeal[mealKey].map(r => r.food_name).join(', ')}
                        kcal={Math.round(yesterdayByMeal[mealKey].reduce((sum, r) => sum + (Number(r.calories) || 0), 0))}
                        onCommit={() => copyFromYesterday(mealKey)}
                        disabled={copyingYesterday}
                      />
                    )}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border-default)' }}>
                        {items.length === 0 ? (
                          <p style={{ color: 'var(--text-hint)', fontSize: 13, padding: '14px 18px' }}>Nothing logged yet</p>
                        ) : (
                          items.map(item => (
                            <LogItemRow
                              key={item.id}
                              item={item}
                              isExpanded={expandedId === item.id}
                              onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
                              onDelete={() => handleDeleteItem(item.id)}
                              onSave={async (fields) => { await updateFood(item.id, fields); setExpandedId(null); }}
                            />
                          ))
                        )}
                        <button onClick={() => navigate('/food', { state: { openMeal: mealKey, date: selectedDate } })} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: 13, cursor: 'pointer', padding: '12px 18px', textAlign: 'left' }}>
                          + Add food
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCopyModal && (
        <CopyDayModal
          destDate={selectedDate}
          onClose={() => setShowCopyModal(false)}
          onCopied={refetch}
        />
      )}
      {toast && <Toast message={toast} error={toastError} action={toastAction} duration={toastAction ? 5000 : 2200} onDone={() => setToast(null)} />}
    </div>
  );
}
