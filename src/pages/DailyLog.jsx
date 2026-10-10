import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { hasProAccess } from '../lib/proAccess';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import { latestDate } from '../lib/weekStrip';
import { slotFromTime } from '../lib/daySlots';
import { copyDaySlots } from '../lib/db';
import AppNav from '../components/AppNav';
import CoachNote from '../components/CoachNote';
import TodayPlanStrip from '../components/TodayPlanStrip';
import { useCoachNote } from '../hooks/useCoach';
import LogItemRow from '../components/LogItemRow';
import SlotTimeline from '../components/SlotTimeline';
import QuickAddBar from '../components/QuickAddBar';
import QuickMacroSheet from '../components/QuickMacroSheet';
import PasteSlotModal from '../components/PasteSlotModal';
import DaySelector from '../components/DaySelector';
import DailyLogViewToggle from '../components/DailyLogViewToggle';
import CopyDayModal from '../components/CopyDayModal';
import Toast from '../components/Toast';
import { round1, withBrand } from '../lib/format';
import { useCopyYesterday } from '../hooks/useCopyYesterday';
import YesterdayMealPrompt from '../components/YesterdayMealPrompt';
import PageHeader from '../components/PageHeader';
import PullIndicator from '../components/PullIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useDaySwipe } from '../hooks/useDaySwipe';
import { shiftDate } from '../lib/gestures';
import { useCommunityShare } from '../hooks/useCommunityShare';
import { buildDayPost, buildMealPost } from '../lib/communityPosts';
import { targetsForDate } from '../lib/dayTargets';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export default function DailyLog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, save: saveProfile } = useProfile();
  const isPremium = hasProAccess(profile); // a Coach Pass includes Pro — see lib/proAccess.js
  const dailyLogView = profile?.daily_log_view || 'meals';
  const showSlots = isPremium && dailyLogView === 'slots';
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
    return requested && requested <= latestDate(today) ? requested : today;
  });
  useEffect(() => {
    const requested = location.state?.date;
    if (requested && requested <= latestDate(today)) setSelectedDate(requested);
  }, [location.state, today]);
  const isToday = selectedDate === today;

  const { note: nutritionCoachNote, dismiss: dismissNutritionCoachNote } = useCoachNote('nutrition', selectedDate);
  const { meals, daySlots, slotTimeline, loading, deleteFood, updateFood, addFood, addSlot, editSlot, removeSlot, refetch } = useFoodLogs(selectedDate);
  const [open, setOpen] = useState({ breakfast: true, lunch: true, dinner: true, snacks: true });
  const [expandedId, setExpandedId] = useState(null);

  // Pull down to refresh; swipe right/left for the previous/next day.
  // `swipeKey` remounts the page body on a swipe so it slides in from the
  // side the new day came from.
  const [swipe, setSwipe] = useState({ key: 0, from: null });
  const goDay = useCallback((delta) => {
    setSelectedDate((d) => {
      const next = shiftDate(d, delta);
      return next > latestDate(today) ? d : next;
    });
    setExpandedId(null);
    setSwipe((s) => ({ key: s.key + 1, from: delta > 0 ? 'right' : 'left' }));
  }, [today]);
  const swipeRef = useDaySwipe({ onPrev: () => goDay(-1), onNext: selectedDate >= latestDate(today) ? null : () => goDay(1) });
  const [pullRef, pullState] = usePullToRefresh(() => refetch());
  // One ref for the scroll container, shared by both gestures.
  const setScrollEl = useCallback((el) => { pullRef.current = el; swipeRef.current = el; }, [pullRef, swipeRef]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [showPasteSlotModal, setShowPasteSlotModal] = useState(false);
  const [showQuickMacro, setShowQuickMacro] = useState(false);
  const [copyingYesterdaySlots, setCopyingYesterdaySlots] = useState(false);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const [toastAction, setToastAction] = useState(null);
  function showToast(message, isError = false, action = null) {
    setToast(message);
    setToastError(isError);
    setToastAction(action);
  }

  const { byMeal: yesterdayByMeal, copy: copyFromYesterday, copying: copyingYesterday } = useCopyYesterday(selectedDate, refetch, showToast);

  // "Share to Community" — only offered once Community is switched on.
  const community = useCommunityShare((m) => showToast(m));
  const allItems = Object.values(meals).flat();
  const shareDay = () => community.share(buildDayPost({ date: selectedDate, today, items: allItems, targetCalories: targetsForDate(profile, selectedDate)?.calories }));
  const shareMeal = (mealKey, items) => community.share(buildMealPost({ meal: mealKey, date: selectedDate, items }));

  // deleteFood had no error handling anywhere it was used — a failed
  // delete (network blip, RLS hiccup) just silently did nothing, no toast,
  // no console hint. LogItemRow already catches and inline-surfaces its
  // own onSave failures (see its `error` state), so only delete needs
  // this; wrapping once here reaches every call site below (the
  // meal-grouped view's LogItemRow rows and SlotTimeline's own, which
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

  // Slots mode's "Copy yesterday" — copyFromYesterday (above) only knows
  // the meal enum, so this bypasses it and calls the slot-aware copy
  // directly, same as CopyDayModal's mode="slots" does for "Copy from
  // another day…" below.
  async function handleCopyYesterdaySlots() {
    if (copyingYesterdaySlots) return;
    setCopyingYesterdaySlots(true);
    try {
      const yesterday = new Date(selectedDate + 'T00:00:00');
      yesterday.setDate(yesterday.getDate() - 1);
      const result = await copyDaySlots(profile.id, todayLocalDate(yesterday), selectedDate);
      if (result.slots.length === 0) {
        showToast('No slots set up yesterday', true);
      } else {
        await refetch();
        showToast(`Copied ${result.slots.length} slot${result.slots.length === 1 ? '' : 's'} from yesterday`);
      }
    } catch {
      showToast("Couldn't copy — try again", true);
    } finally {
      setCopyingYesterdaySlots(false);
    }
  }

  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const totalCal = Object.values(meals).flat().reduce((s, i) => s + i.cal, 0);
  const dateStr = isToday
    ? 'Today'
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="log" initials={initials} />

      <div ref={setScrollEl} className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PullIndicator {...pullState} />
        <PageHeader
          title="Daily log"
          onBack={() => navigate('/dashboard')}
          backLabel="Back to Dashboard"
          right={
            <div style={{ position: 'relative', display: 'flex', flexShrink: 0, gap: 8 }}>
            {community.canShare && selectedDate <= today && allItems.length > 0 && (
              <button onClick={shareDay} title="Share this day to Community" aria-label="Share this day" className="app-icon-btn">
                <i className="ti ti-share-3" />
              </button>
            )}
            <button onClick={() => setShowCopyMenu(v => !v)} title="Copy meals" aria-label="Copy meals" className="app-icon-btn">
              <i className="ti ti-copy" />
            </button>
            {showCopyMenu && (
              <>
                <div onClick={() => setShowCopyMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 41, minWidth: 210, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                  <button onClick={() => { setShowCopyMenu(false); showSlots ? handleCopyYesterdaySlots() : copyFromYesterday(); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>Copy yesterday</button>
                  <button onClick={() => { setShowCopyMenu(false); setShowCopyModal(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: showSlots ? '1px solid var(--border-default)' : 'none', padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>Copy from another day…</button>
                  {showSlots && (
                    <button onClick={() => { setShowCopyMenu(false); setShowPasteSlotModal(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>Paste slot…</button>
                  )}
                </div>
              </>
            )}
          </div>
          }
        >
          {isPremium ? (
            <DailyLogViewToggle value={dailyLogView} onChange={handleViewChange} fill />
          ) : (
            <div title="Custom slots — a Pro feature" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '5px 12px', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
              <i className="ti ti-lock" style={{ fontSize: 12 }} /> <span className="hide-on-narrow">Custom slots (Pro)</span>
            </div>
          )}
        </PageHeader>

        <div key={swipe.key} className={`page-pad${swipe.from ? ` day-slide-from-${swipe.from}` : ''}`} style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 20 }}>
            <DaySelector allowFuture selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setExpandedId(null); }} />
            <div style={{ marginTop: 16 }}>
              <div data-testid="log-date" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-secondary)' }} />
                {dateStr}
              </div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginTop: 2 }}>{Math.round(totalCal).toLocaleString()} kcal logged</div>
            </div>
            {viewSaveError && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{viewSaveError}</p>}
          </div>

          <TodayPlanStrip date={selectedDate} style={{ marginBottom: 20 }} />

          {nutritionCoachNote && <CoachNote note={nutritionCoachNote} onDismiss={dismissNutritionCoachNote} style={{ marginBottom: 20 }} />}

          {loading ? null : showSlots ? (
            <>
              <SlotTimeline
                segments={slotTimeline}
                onDelete={handleDeleteItem}
                onSave={updateFood}
                onNavigateAdd={(slot) => navigate('/food', { state: { date: selectedDate, presetSlotId: slot.id, presetTime: slot.slotTime } })}
                onAddSlot={addSlot}
                onEditSlot={editSlot}
                onDeleteSlot={removeSlot}
                emptyMessage={isToday ? 'Nothing set up for today yet — add your first slot below.' : 'Nothing set up this day.'}
              />
              <QuickAddBar
                selectedDate={selectedDate}
                currentSlotId={slotFromTime(daySlots)?.id ?? null}
                onOpenQuickMacro={() => setShowQuickMacro(true)}
              />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(meals).map(([mealKey, items]) => {
                const mealTotal = Math.round(items.reduce((s, i) => s + i.cal, 0));
                const mealProtein = round1(items.reduce((s, i) => s + i.protein, 0));
                const mealCarbs = round1(items.reduce((s, i) => s + i.carbs, 0));
                const mealFat = round1(items.reduce((s, i) => s + i.fat, 0));
                const isOpen = open[mealKey];
                return (
                  <div key={mealKey} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, overflow: 'hidden' }}>
                    <button onClick={() => setOpen(o => ({ ...o, [mealKey]: !o[mealKey] }))} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{MEAL_LABELS[mealKey]}</div>
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
                        names={yesterdayByMeal[mealKey].map(r => withBrand(r.food_name, r.brand)).join(', ')}
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
                        {community.canShare && selectedDate <= today && items.length > 0 && (
                          <button onClick={() => shareMeal(mealKey, items)} aria-label={`Share ${MEAL_LABELS[mealKey]} to Community`} style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '12px 18px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <i className="ti ti-share-3" aria-hidden="true" /> Share this meal
                          </button>
                        )}
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
          mode={showSlots ? 'slots' : 'meals'}
        />
      )}
      {showPasteSlotModal && (
        <PasteSlotModal
          destDate={selectedDate}
          onClose={() => setShowPasteSlotModal(false)}
          onPasted={refetch}
        />
      )}
      {showQuickMacro && (
        <QuickMacroSheet
          onClose={() => setShowQuickMacro(false)}
          onSubmit={(food) => addFood(food, undefined, new Date(), slotFromTime(daySlots)?.id ?? null)}
        />
      )}
      {community.sheet}
      {toast && <Toast message={toast} error={toastError} action={toastAction} duration={toastAction ? 5000 : 2200} onDone={() => setToast(null)} />}
    </div>
  );
}
