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
import { CropViewer } from './MenuPickDetails';
import { MenuList, MenuReview } from './scan/MenuResult';
import { ScanErrorPage } from './scan/ScanKit';
import { useMenuPickDetail } from '../hooks/useMenuPickDetail';
import { adjustPick, loggedName } from '../lib/menuTweaks';
import { fetchWithTimeout } from '../lib/http';

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

export default function MenuScanModal({ onClose, onAddFood, showSlots, onSearchManually, selectedDate }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [menuItems, setMenuItems] = useState(null);
  const [filter, setFilter] = useState('all');
  // Optional extras the AI read off the menu: the restaurant's name and a
  // sentence of advice (see api/_scanExtras.js).
  const [restaurant, setRestaurant] = useState(null);
  const [advice, setAdvice] = useState(null);
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
  const consumedProtein = todaysLogs.reduce((s, l) => s + (Number(l.protein_g) || 0), 0);

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
    setFilter('all');
    setRestaurant(null);
    setAdvice(null);
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
      setRestaurant(data.restaurant || null);
      setAdvice(data.advice || null);
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

  function mealLabelNow() {
    const meal = mealFromDate(new Date());
    return meal.charAt(0).toUpperCase() + meal.slice(1);
  }

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

  // "Log to Dinner" on a ranked dish: that dish at its listed portion, now,
  // without opening it (portion and tweaks can still be changed in the log).
  async function handleLogOne(data) {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const now = new Date();
      const base = adjustPick(data, null, [], null);
      await onAddFood({ name: data.name, ...base, source: 'menu', servingLabel: '1 serving' }, showSlots ? null : mealLabelNow(), showSlots ? now : null);
      onClose();
    } catch (err) {
      console.error(err);
      setAddError("Couldn't add this — try again.");
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
          <span className="x-mark" aria-hidden="true" />
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

  // Something went wrong before there was anything to show: its own page.
  if (error && !hasResults) {
    return (
      <ScanErrorPage
        title="Scan a menu" error={error} limitReached={limitReached} closing={closing}
        onBack={close} onUpgrade={() => navigate('/pricing')} onRetry={reset} onSearchManually={onSearchManually}
      />
    );
  }

  const consumed = { cal: consumedToday, protein: consumedProtein };

  if (picked) {
    return (
      <>
        <MenuReview
          picked={picked} adjusted={adjusted}
          sourceLabel={picked.kind === 'recommendation' ? `Pick #${picked.index + 1}` : `Menu Item #${picked.index + 1}`}
          detail={detail} detailLoading={detailLoading} portions={portions} portionIdx={portionIdx} setPortionIdx={setPortionIdx}
          tweaks={tweaks} activeTweaks={activeTweaks} onToggleTweak={toggleTweak} onInspect={() => setCropOpen(true)}
          dailyTarget={dailyTarget} consumed={consumed}
          comment={comment} setComment={setComment}
          voice={{ recording: voiceRecording, transcribing: voiceTranscribing, error: voiceError, start: startVoice, stop: stopVoice }}
          correcting={correcting} correctionError={correctionError} onCorrect={handleCorrect}
          onBack={() => choosePick(null)} onLog={handleLog} adding={adding} closing={closing} error={error}
        />
        {cropOpen && detail?.source?.box && <CropViewer photo={preview} box={detail.source.box} onClose={() => setCropOpen(false)} />}
      </>
    );
  }

  return (
    <MenuList
      preview={preview} restaurant={restaurant} advice={advice}
      recommendations={recommendations || []} menuItems={menuItems || []} groupedItems={groupedItems}
      filter={filter} setFilter={setFilter}
      isSelected={(kind, i) => selected.has(selKey(kind, i))}
      onToggle={toggleSelected}
      onOpen={(kind, data, index) => choosePick({ kind, data, index })}
      onLogOne={(kind, data) => handleLogOne(data)}
      mealLabel={mealLabelNow()} dailyTarget={dailyTarget} consumed={consumed}
      onRescan={reset} onSearchManually={onSearchManually} onClose={close} closing={closing}
      adding={adding} addError={addError}
      selectedList={selectedList} selectedCal={selectedCal}
      onLogSelected={handleLogSelected} onClearSelected={() => { setSelected(new Map()); setAddError(null); }}
    />
  );
}
