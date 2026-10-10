import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mealFromDate } from '../lib/mealTime';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { targetsForDate } from '../lib/dayTargets';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';
import DragSheet from './DragSheet';
import SegmentedControl from './SegmentedControl';
import MacroBreakdown from './MacroBreakdown';
import DayBudgetImpact from './DayBudgetImpact';
import VoiceMicButton from './VoiceMicButton';
import { SourcePill, CropViewer, PortionRow, PortionSkeleton, IncludesRow, QuickTweaks } from './MenuPickDetails';
import { useMenuPickDetail } from '../hooks/useMenuPickDetail';
import { adjustPick, loggedName } from '../lib/menuTweaks';
import { fetchWithTimeout } from '../lib/http';

const SCAN_TABS = [
  { id: 'goal', label: 'For your goal', icon: 'ti-sparkles' },
  { id: 'all', label: 'All items', icon: 'ti-list' },
];

// Downscale + re-encode before upload — same reasoning as PhotoScanModal's
// resizeImage: keeps the request under serverless body-size limits and
// cuts vision tokens without hurting readability of menu text.
function resizeImage(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl, base64: dataUrl.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// The model is asked for null when a pick is ordered exactly as listed, but
// sometimes says "None" or similar instead — treat those as no modification
// too rather than showing a redundant "Modified: None" line.
function hasModification(text) {
  return !!text && !/^(none|no modifications?|n\/a|as listed|as-is)\.?$/i.test(text.trim());
}

function MacroGrid({ pick }) {
  return <MacroBreakdown values={{ cal: pick.cal, protein: pick.protein, carbs: pick.carbs, fat: pick.fat }} />;
}

// The round tick at the left of a dish: select it to add together with others.
function SelectBox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{ flexShrink: 0, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <span style={{ width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box', border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`, background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-contrast)', fontSize: 13 }}>
        {checked && <i className="ti ti-check" aria-hidden="true" />}
      </span>
    </button>
  );
}

export default function MenuScanModal({ onClose, onAddFood, showSlots, onSearchManually, selectedDate }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [menuItems, setMenuItems] = useState(null);
  const [activeTab, setActiveTab] = useState('goal');
  // { kind: 'recommendation' | 'item', data } — one shared shape for
  // whichever list the pick came from, so the review/confirm step below
  // doesn't need to know which tab it was tapped from.
  const [picked, setPicked] = useState(null);
  // Dishes ticked in the lists, to be added together (key -> { kind, data }).
  const [selected, setSelected] = useState(() => new Map());
  const [addError, setAddError] = useState(null);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState('');
  const [correcting, setCorrecting] = useState(false);
  // Separate from the main `error` so a failed correction doesn't blow
  // away the perfectly good pick already on screen — it shows inline
  // near the comment box instead.
  const [correctionError, setCorrectionError] = useState(null);
  // Confirm-step fine-tuning: which portion size is chosen (index into the
  // detail's portions, 0 = as listed) and which quick tweaks are on.
  const [portionIdx, setPortionIdx] = useState(0);
  const [activeTweaks, setActiveTweaks] = useState(() => new Set());
  const [cropOpen, setCropOpen] = useState(false);
  const { closing, close } = useClosingTransition(onClose);

  // Speaking a correction instead of typing it — same record/upload
  // plumbing as PhotoScanModal's correction box, appending to (rather than
  // replacing) anything already typed.
  const { recording: voiceRecording, transcribing: voiceTranscribing, error: voiceError, start: startVoice, stop: stopVoice } = useVoiceTranscription((text) => {
    setComment(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
  });

  // Read-only here — today's logs for the day-budget-impact preview, not
  // wired to onAddFood (that already goes through the parent's own
  // useFoodLogs via onAddFood). Mirrors PhotoScanModal's identical wiring.
  const { profile } = useProfile();
  const { logs: todaysLogs } = useFoodLogs(selectedDate);
  const dailyTarget = targetsForDate(profile, selectedDate);
  const consumedToday = todaysLogs.reduce((s, l) => s + (Number(l.calories) || 0), 0);

  // Clears any correction UI left over from a previous pick — picking a
  // different item (or going back to pick again) shouldn't carry a stale
  // comment or error meant for the last one. Named distinctly from
  // `setPicked` (not `pick`) since `recommendations.map((pick, i) => ...)`
  // below already uses `pick` as its loop variable name.
  function choosePick(next) {
    setPicked(next);
    setComment('');
    setCorrectionError(null);
    setPortionIdx(0);
    setActiveTweaks(new Set());
    setCropOpen(false);
  }

  const selKey = (kind, index) => `${kind}:${index}`;
  function toggleSelected(kind, data, index) {
    setAddError(null);
    setSelected((prev) => {
      const next = new Map(prev);
      const key = selKey(kind, index);
      if (next.has(key)) next.delete(key); else next.set(key, { kind, data });
      return next;
    });
  }
  const selectedList = useMemo(() => [...selected.entries()], [selected]);
  const selectedCal = selectedList.reduce((sum, [, { data }]) => sum + (Number(data.cal) || 0), 0);

  function toggleTweak(i) {
    setActiveTweaks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  // Portion, tweaks and the dish's own extras, folded into the numbers that
  // actually get shown, budgeted and logged.
  const { detail, loading: detailLoading } = useMenuPickDetail(preview, picked?.data);
  const portions = detail?.portions || [];
  const tweaks = detail?.tweaks || [];
  const chosenPortion = portions[portionIdx] || null;
  const chosenTweaks = tweaks.filter((_, i) => activeTweaks.has(i));
  const adjusted = useMemo(
    () => (picked ? adjustPick(picked.data, chosenPortion, chosenTweaks, detail) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, detail, portionIdx, activeTweaks],
  );

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setLimitReached(false);
    setRecommendations(null);
    setMenuItems(null);
    setPicked(null);
    setSelected(new Map());
    setAddError(null);
    setActiveTab('goal');
    setAnalyzing(true);
    let dataUrl, base64;
    try {
      ({ dataUrl, base64 } = await resizeImage(file));
    } catch (err) {
      // Not a network problem — the file itself couldn't be decoded
      // (unsupported format, e.g. HEIC on a desktop browser). Say so,
      // instead of the "check your connection" the catch below gives.
      console.error('Image prep failed:', err);
      setError("Couldn't read that image — try taking the photo again, or pick a JPEG/PNG.");
      setAnalyzing(false);
      return;
    }
    try {
      setPreview(dataUrl);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithTimeout('/api/recognize-menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Couldn't read this menu. Try again.");
        setLimitReached(!!data.limitReached);
        return;
      }
      setRecommendations(data.recommendations || []);
      setMenuItems(data.items || []);
    } catch (err) {
      console.error(err);
      setError("Couldn't read this menu. Check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    setSelected(new Map());
    setAddError(null);
    setPreview(null);
    setRecommendations(null);
    setMenuItems(null);
    setPicked(null);
    setError(null);
    setLimitReached(false);
    setComment('');
    setCorrectionError(null);
  }

  const groupedItems = useMemo(() => {
    if (!menuItems) return [];
    const bySection = new Map();
    for (const item of menuItems) {
      const key = item.section || 'Menu';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(item);
    }
    return Array.from(bySection, ([section, items]) => ({ section, items }));
  }, [menuItems]);

  async function handleLog() {
    if (!picked) return;
    setAdding(true);
    try {
      const now = new Date();
      const food = {
        name: loggedName(picked.data.name, chosenTweaks),
        cal: adjusted.cal,
        protein: adjusted.protein,
        carbs: adjusted.carbs,
        fat: adjusted.fat,
        ...(adjusted.fibre != null ? { fibre: adjusted.fibre } : {}),
        ...(adjusted.sodium != null ? { sodium: adjusted.sodium } : {}),
        ...(adjusted.sugar != null ? { sugar: adjusted.sugar } : {}),
        source: 'menu',
        // No servingGrams — same reasoning as photo scan: this is an AI
        // estimate off a menu photo, not a measured weight. servingLabel
        // is just "1 serving" (both a recommendation and a menu item are
        // already single-serving as ordered/printed) so Recent/Frequent
        // show that instead of a generic "Logged before".
        servingLabel: chosenPortion?.label || '1 serving',
      };
      const meal = mealFromDate(now);
      const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
      await onAddFood(food, showSlots ? null : mealLabel, showSlots ? now : null);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't add this — try again.");
    } finally {
      setAdding(false);
    }
  }

  // Everything ticked, each as its own entry at its listed portion (portions
  // and tweaks can still be changed per dish by tapping it, or later in the log).
  async function handleLogSelected() {
    if (selectedList.length === 0 || adding) return;
    setAdding(true);
    setAddError(null);
    const now = new Date();
    const meal = mealFromDate(now);
    const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
    const done = [];
    try {
      for (const [key, { data }] of selectedList) {
        const base = adjustPick(data, null, [], null);
        await onAddFood({ name: data.name, ...base, source: 'menu', servingLabel: '1 serving' }, showSlots ? null : mealLabel, showSlots ? now : null);
        done.push(key);
      }
      onClose();
    } catch (err) {
      console.error(err);
      // What did get added is out of the selection, so trying again can't double it.
      setSelected((prev) => { const next = new Map(prev); done.forEach((k) => next.delete(k)); return next; });
      setAddError(done.length ? `Added ${done.length}, but couldn't add the rest. Try again.` : "Couldn't add these — try again.");
    } finally {
      setAdding(false);
    }
  }

  // Re-sends the same photo (already held in `preview` as a data URL) plus
  // the user's comment and the current pick, so Claude corrects from
  // context instead of guessing blind again. Free and unlimited — see
  // api/recognize-menu.js's isCorrection branch, which skips the scan cap
  // entirely for these calls.
  async function handleCorrect() {
    if (!comment.trim() || !picked || !preview) return;
    setCorrecting(true);
    setCorrectionError(null);
    try {
      const base64 = preview.split(',')[1];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithTimeout('/api/recognize-menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg', correction: comment.trim(), previousItem: picked.data }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCorrectionError(data.error || "Couldn't apply that correction. Try again.");
        return;
      }
      setPicked(prev => ({ ...prev, data: { ...prev.data, ...data } }));
      setComment('');
      // A re-estimate replaces the base numbers, so a portion/tweaks chosen
      // against the old ones no longer mean what they did.
      setPortionIdx(0);
      setActiveTweaks(new Set());
    } catch (err) {
      console.error(err);
      setCorrectionError("Couldn't apply that correction. Check your connection and try again.");
    } finally {
      setCorrecting(false);
    }
  }

  const hasResults = !!(recommendations || menuItems);

  // Same pattern as PhotoScanModal — the camera is its own full-screen
  // step, not squeezed into the modal card, so it feels like an actual
  // camera rather than a small embedded preview.
  // `&& !error`: a failure before the preview exists (image decode, etc.)
  // used to fall through to here and show the camera again with no sign
  // anything went wrong.
  if (!preview && !error) {
    return <CameraCapture onCapture={handleFile} hint="Fit the whole menu section in frame" fullScreen onClose={close} />;
  }

  // Keep the captured photo full-screen through the analyzing wait too —
  // shrinking it into a small card the instant analysis starts read as an
  // abrupt downgrade from the full-screen camera a moment earlier. Once
  // there are results or an error to show, the sheet below takes over.
  if (!hasResults && !error) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <button
          onClick={close}
          aria-label="Close"
          title="Close"
          style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(20,17,16,0.6)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          ✕
        </button>
        {analyzing && (
          <div style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
            Reading the whole menu…
          </div>
        )}
      </div>
    );
  }

  // Pinned under the scrolling review (see DragSheet's `footer`) so Back and
  // Confirm are always reachable, however tall the estimate + comment box get.
  const footer = picked ? (
    <div style={{ display: 'flex', gap: 10 }}>
      <button
        onClick={() => choosePick(null)}
        aria-label={picked.kind === 'recommendation' ? 'Back to options' : 'Back to menu'}
        style={{ flexShrink: 0, minHeight: 52, padding: '0 14px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Back<span className="scan-bar-label"> to {picked.kind === 'recommendation' ? 'options' : 'menu'}</span>
      </button>
      <button
        onClick={handleLog}
        disabled={adding}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          minHeight: 52, padding: '0 12px', borderRadius: 14, border: 'none',
          background: adding ? 'var(--border-default)' : 'var(--accent)',
          color: adding ? 'var(--text-muted)' : 'var(--accent-contrast)',
          fontSize: 14, fontWeight: 700, cursor: adding ? 'not-allowed' : 'pointer',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adding ? 'Adding…' : 'Confirm & log'}</span>
        {!adding && (
          <span style={{ flexShrink: 0, background: 'rgba(0,0,0,0.18)', borderRadius: 99, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
            +{adjusted.cal} kcal
          </span>
        )}
      </button>
    </div>
  ) : (hasResults && !error && selectedList.length > 0) ? (
    <div>
      {addError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{addError}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => { setSelected(new Map()); setAddError(null); }}
          style={{ flexShrink: 0, minHeight: 52, padding: '0 16px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Clear
        </button>
        <button
          onClick={handleLogSelected}
          disabled={adding}
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 52, padding: '0 12px', borderRadius: 14, border: 'none',
            background: adding ? 'var(--border-default)' : 'var(--accent)',
            color: adding ? 'var(--text-muted)' : 'var(--accent-contrast)',
            fontSize: 14, fontWeight: 700, cursor: adding ? 'not-allowed' : 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adding ? 'Adding…' : `Add ${selectedList.length} item${selectedList.length === 1 ? '' : 's'}`}</span>
          {!adding && (
            <span style={{ flexShrink: 0, background: 'rgba(0,0,0,0.18)', borderRadius: 99, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
              +{Math.round(selectedCal)} kcal
            </span>
          )}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <DragSheet title={picked ? 'Confirm pick' : 'Scan a menu'} onClose={close} closing={closing} footer={footer}>
      {preview && !picked && (
        <img src={preview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />
      )}

      {analyzing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          Reading the whole menu…
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: limitReached ? '#1a1508' : '#1a0f0f', border: `1px solid ${limitReached ? '#4a3a1a' : '#c0707040'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: limitReached ? 'var(--gold)' : 'var(--danger)', marginBottom: 10 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {limitReached ? (
              <button onClick={() => navigate('/pricing')} style={{ flex: 1, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '9px', fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Upgrade to Pro
              </button>
            ) : (
              <button onClick={reset} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Try another photo
              </button>
            )}
            {onSearchManually && (
              <button onClick={onSearchManually} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Search manually
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results — a "for your goal" tab of 3 ranked picks, and an "all
          items" tab covering the whole menu. Tap any card/row in either to
          review before logging. */}
      {hasResults && !picked && !error && (
        <div style={{ marginTop: 14 }}>
          <SegmentedControl options={SCAN_TABS} value={activeTab} onChange={setActiveTab} fill style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>Tick every dish you had to add them together, or tap one to adjust its portion first.</p>

          {activeTab === 'goal' && (
            recommendations.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Couldn't put together recommendations for this menu.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {recommendations.map((pick, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
                  <SelectBox checked={selected.has(selKey('recommendation', i))} onChange={() => toggleSelected('recommendation', pick, i)} label={`Select ${pick.name}`} />
                  <button
                    onClick={() => choosePick({ kind: 'recommendation', data: pick, index: i })}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'var(--bg-card)', border: `1px solid ${selected.has(selKey('recommendation', i)) ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, padding: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? 'var(--accent-contrast)' : 'var(--bg-primary)', background: i === 0 ? 'var(--accent)' : 'var(--border-strong)', borderRadius: 5, padding: '2px 6px' }}>#{i + 1}</span>
                      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{pick.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: hasModification(pick.modifications) ? 2 : 10, lineHeight: 1.4 }}>{pick.items}</div>
                    {hasModification(pick.modifications) && (
                      <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10 }}>Modified: {pick.modifications}</div>
                    )}
                    <MacroGrid pick={pick} />
                  </button>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'all' && (
            groupedItems.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Couldn't make out individual items on this menu.</p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {groupedItems.map(({ section, items }) => (
                  <div key={section} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{section}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {items.map((item, i) => {
                        const itemIndex = menuItems.indexOf(item);
                        const ticked = selected.has(selKey('item', itemIndex));
                        return (
                        <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
                        <SelectBox checked={ticked} onChange={() => toggleSelected('item', item, itemIndex)} label={`Select ${item.name}`} />
                        <button
                          onClick={() => choosePick({ kind: 'item', data: item, index: itemIndex })}
                          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'var(--bg-card)', border: `1px solid ${ticked ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{item.name}</div>
                            {item.description && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>{item.cal} kcal</div>
                            <div>{item.protein}p · {item.carbs}c · {item.fat}f</div>
                          </div>
                        </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          <button onClick={reset} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Try another photo</button>
        </div>
      )}

      {/* Review — the picked recommendation or menu item, confirm before logging */}
      {picked && (
        <div style={{ marginTop: 0 }}>
          {/* Where on the photo this came from — "Menu Item #4 • "Mixed wrap"". */}
          <SourcePill
            label={picked.kind === 'recommendation' ? `Pick #${picked.index + 1}` : `Menu Item #${picked.index + 1}`}
            quote={detail?.source?.quote}
            onInspect={detail?.source?.box ? () => setCropOpen(true) : undefined}
          />
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>{picked.data.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: hasModification(picked.data.modifications) ? 2 : 10, lineHeight: 1.4 }}>
              {picked.kind === 'recommendation' ? picked.data.items : (picked.data.description || picked.data.section)}
            </div>
            {picked.kind === 'recommendation' && hasModification(picked.data.modifications) && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10 }}>Modified: {picked.data.modifications}</div>
            )}
            {portions.length > 1 ? (
              <PortionRow portions={portions} value={portionIdx} onChange={setPortionIdx} />
            ) : detailLoading ? (
              <PortionSkeleton />
            ) : null}
            <MacroGrid pick={adjusted} />
            {detail && (
              <IncludesRow allergens={detail.allergens} sodiumMg={adjusted.sodium} sodium={adjusted.sodium} fibre={adjusted.fibre} sugar={adjusted.sugar} />
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
            This is an AI estimate based on the menu photo, not verified nutrition data — review before adding.
          </p>
          {dailyTarget.calories > 0 && (
            <div style={{ marginBottom: 14 }}>
              <DayBudgetImpact target={dailyTarget.calories} consumed={consumedToday} adding={adjusted.cal} />
            </div>
          )}

          {/* Always visible, not gated behind a "this is wrong" toggle —
              correcting is free (doesn't cost a scan) and can be done as
              many times as needed. Covers both "the AI got this pick
              wrong" and "I want to note what I actually got" (extra
              sauce, a swapped side, a different size than listed) — same
              comment box either way, since both just re-estimate this
              one pick's macros from the same menu photo plus the note. */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Get something different, or want to note a change? Tell it here</label>
              <VoiceMicButton recording={voiceRecording} transcribing={voiceTranscribing} onStart={startVoice} onStop={stopVoice} title="Speak your correction" />
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="e.g. I got the large size, or no cheese, or extra sauce on the side"
              disabled={correcting}
              rows={3}
              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
            />
            {voiceError && <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--danger)' }}>{voiceError}</div>}
            {tweaks.length > 0 && <QuickTweaks tweaks={tweaks} active={activeTweaks} onToggle={toggleTweak} />}
            <button
              onClick={handleCorrect}
              disabled={!comment.trim() || correcting}
              style={{
                width: '100%',
                background: !comment.trim() || correcting ? 'var(--border-default)' : 'var(--accent-bg)',
                border: `1px solid ${!comment.trim() || correcting ? 'var(--border-default)' : 'var(--border-active)'}`,
                borderRadius: 7, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                color: !comment.trim() || correcting ? 'var(--text-muted)' : 'var(--accent)',
                cursor: !comment.trim() || correcting ? 'not-allowed' : 'pointer',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {correcting ? 'Fixing…' : 'Recalculate'}
            </button>
            {correctionError && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{correctionError}</div>
            )}
          </div>
        </div>
      )}
      {cropOpen && detail?.source?.box && <CropViewer photo={preview} box={detail.source.box} onClose={() => setCropOpen(false)} />}
    </DragSheet>
  );
}
