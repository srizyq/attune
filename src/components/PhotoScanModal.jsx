import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeStringToDate } from '../lib/mealTime';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { targetsForDate } from '../lib/dayTargets';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';
import PhotoResult from './scan/PhotoResult';
import { ScanErrorPage } from './scan/ScanKit';
import { fetchWithTimeout } from '../lib/http';

const round1 = n => Math.round(n * 10) / 10;

// The API returns each ingredient's own AI-estimated weight (baseGrams) and
// the macros that go with it (baseCal etc.) — kept separate from the live,
// user-editable `grams` so editing one ingredient's weight scales just that
// ingredient's own macros proportionally, without losing the AI's original
// estimate to re-derive from.
function ingredientsFromResponse(list) {
  return (list || []).map(ing => ({
    name: ing.name,
    baseGrams: Number(ing.grams) || 0,
    grams: Number(ing.grams) || 0,
    baseCal: Number(ing.cal) || 0,
    baseProtein: Number(ing.protein) || 0,
    baseCarbs: Number(ing.carbs) || 0,
    baseFat: Number(ing.fat) || 0,
    baseFibre: Number(ing.fibre) || 0,
    baseSodium: Number(ing.sodium) || 0,
    baseSugar: Number(ing.sugar) || 0,
    // Optional extras from the AI (see api/_scanExtras.js) — shown when present.
    match: Number.isFinite(Number(ing.match)) && ing.match !== null && ing.match !== '' ? Number(ing.match) : null,
    portion: typeof ing.portion === 'string' ? ing.portion : '',
  }));
}

function scaleIngredient(ing) {
  const ratio = ing.baseGrams > 0 ? ing.grams / ing.baseGrams : 1;
  return {
    name: ing.name,
    grams: ing.grams,
    cal: Math.round(ing.baseCal * ratio),
    protein: round1(ing.baseProtein * ratio),
    carbs: round1(ing.baseCarbs * ratio),
    fat: round1(ing.baseFat * ratio),
    fibre: round1(ing.baseFibre * ratio),
    sodium: Math.round(ing.baseSodium * ratio),
    sugar: round1(ing.baseSugar * ratio),
  };
}

// Downscale + re-encode before upload: keeps the request well under
// serverless body-size limits, and a smaller image also means fewer
// vision tokens (cheaper, faster) without hurting recognition quality —
// food photos don't need full camera resolution to be identifiable.
function resizeImage(file, maxDim = 1024, quality = 0.82) {
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

export default function PhotoScanModal({ onClose, onAddFood, defaultMeal, defaultTime, selectedDate, showSlots, onCreateCustom, onSearchManually, recipeMode = false }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  // The meal's name as it will be logged — the AI's suggestion, editable.
  const [mealName, setMealName] = useState('');
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState('');
  const commentRef = useRef(null);
  const [correcting, setCorrecting] = useState(false);
  const [hasCorrected, setHasCorrected] = useState(false);
  // Separate from the main `error`/`limitReached` pair so a failed
  // correction attempt doesn't blow away the perfectly good result
  // already on screen — it shows inline near the comment box instead.
  const [correctionError, setCorrectionError] = useState(null);
  const [readingLabel, setReadingLabel] = useState(false);
  const [labelError, setLabelError] = useState(null);
  const { closing, close } = useClosingTransition(onClose);

  // Speaking a correction instead of typing it — same record/upload
  // plumbing as Food Search's voice search, appending to (rather than
  // replacing) anything already typed.
  const { recording: voiceRecording, transcribing: voiceTranscribing, error: voiceError, start: startVoice, stop: stopVoice } = useVoiceTranscription((text) => {
    setComment(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
  });

  // Read-only here — today's logs for the day-budget-impact preview, not
  // wired to onAddFood (that already goes through the parent's own
  // useFoodLogs via onAddFood/addFood). Mirrors BarcodeScanner's own
  // DayBudgetImpact wiring in FoodSearch.jsx.
  const { profile } = useProfile();
  const { logs: todaysLogs } = useFoodLogs(selectedDate);
  const dailyTarget = targetsForDate(profile, selectedDate);
  const consumedToday = todaysLogs.reduce((s, l) => s + (Number(l.calories) || 0), 0);
  const consumedProtein = todaysLogs.reduce((s, l) => s + (Number(l.protein_g) || 0), 0);

  const scaledIngredients = useMemo(() => ingredients.map(scaleIngredient), [ingredients]);
  const totals = useMemo(() => scaledIngredients.reduce((t, i) => ({
    cal: t.cal + i.cal,
    protein: t.protein + i.protein,
    carbs: t.carbs + i.carbs,
    fat: t.fat + i.fat,
    fibre: t.fibre + i.fibre,
    sodium: t.sodium + i.sodium,
    sugar: t.sugar + i.sugar,
  }), { cal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, sugar: 0 }), [scaledIngredients]);

  useEffect(() => { setMealName(result?.name || ''); }, [result]);

  function updateIngredientGrams(index, raw) {
    const grams = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    setIngredients(prev => prev.map((ing, i) => (i === index ? { ...ing, grams } : ing)));
  }

  function removeIngredient(index) {
    setIngredients(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // An item the AI missed, typed in by the person. Its numbers are for the
  // weight they gave, so changing the weight afterwards scales them like any
  // other item.
  function addManualIngredient(v) {
    const grams = Number(v.grams) > 0 ? Number(v.grams) : 100;
    setIngredients(prev => [...prev, {
      name: v.name.trim(), baseGrams: grams, grams,
      baseCal: Number(v.cal) || 0, baseProtein: Number(v.protein) || 0, baseCarbs: Number(v.carbs) || 0, baseFat: Number(v.fat) || 0,
      baseFibre: 0, baseSodium: 0, baseSugar: 0, match: null, portion: `${grams}g`,
    }]);
  }

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setLimitReached(false);
    setResult(null);
    setIngredients([]);
    setComment('');
    setCorrectionError(null);
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
      const res = await fetchWithTimeout('/api/recognize-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Couldn't analyze this photo. Try again.");
        setLimitReached(!!data.limitReached);
        return;
      }
      setResult(data);
      setIngredients(ingredientsFromResponse(data.ingredients));
    } catch (err) {
      console.error(err);
      setError("Couldn't analyze this photo. Check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  // Re-sends the same photo (already held in `preview` as a data URL)
  // plus the user's correction and the previous estimate, so Claude
  // corrects from context instead of guessing blind again. Free and
  // unlimited by design — see api/recognize-food.js's `isCorrection`
  // branch, which skips the scan cap entirely for these calls.
  async function handleCorrect() {
    if (!comment.trim() || !result || !preview) return;
    setCorrecting(true);
    setCorrectionError(null);
    try {
      const base64 = preview.split(',')[1];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithTimeout('/api/recognize-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg', correction: comment.trim(), previousResult: result }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCorrectionError(data.error || "Couldn't apply that correction. Try again.");
        return;
      }
      setResult(data);
      setIngredients(ingredientsFromResponse(data.ingredients));
      setComment('');
      setHasCorrected(true);
    } catch (err) {
      console.error(err);
      setCorrectionError("Couldn't apply that correction. Check your connection and try again.");
    } finally {
      setCorrecting(false);
    }
  }

  // Offered when the photo-scan result flags a visible nutrition label —
  // re-reads the SAME photo (no new capture needed) through the label
  // endpoint, which transcribes the label's printed numbers instead of
  // estimating from what the food looks like. Keeps the AI-guessed name,
  // since a nutrition panel rarely carries a clean marketing name.
  async function handleReadLabel() {
    if (!preview || !result) return;
    setReadingLabel(true);
    setLabelError(null);
    try {
      const base64 = preview.split(',')[1];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithTimeout('/api/recognize-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setLabelError(data.error || "Couldn't read the label. Try a closer, well-lit photo of it.");
        return;
      }
      setResult({
        ...result,
        portion: data.serving || result.portion,
        confidence: 'high',
        labelVisible: false,
      });
      // A nutrition label describes one packaged product, not a composite
      // meal — always a single ingredient, matching what the label states.
      setIngredients([{
        name: result.name,
        baseGrams: Number(data.servingGrams) || 100,
        grams: Number(data.servingGrams) || 100,
        baseCal: Number(data.cal) || 0,
        baseProtein: Number(data.protein) || 0,
        baseCarbs: Number(data.carbs) || 0,
        baseFat: Number(data.fat) || 0,
        baseFibre: Number(data.fibre) || 0,
        baseSodium: Number(data.sodium) || 0,
        baseSugar: Number(data.sugar) || 0,
      }]);
    } catch (err) {
      console.error(err);
      setLabelError("Couldn't read the label. Check your connection and try again.");
    } finally {
      setReadingLabel(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setIngredients([]);
    setError(null);
    setLimitReached(false);
    setComment('');
    setCorrectionError(null);
    setHasCorrected(false);
    setLabelError(null);
  }

  // Recalculate lives in the pinned bar, but the box it reads from is down
  // in the scrolling content — with nothing typed yet, take the user there
  // instead of sitting disabled with no hint why.
  function handleRecalculateClick() {
    if (!comment.trim()) {
      commentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      commentRef.current?.focus({ preventScroll: true });
      return;
    }
    handleCorrect();
  }

  async function handleAdd() {
    if (!result || scaledIngredients.length === 0) return;
    setAdding(true);
    try {
      const loggedAt = showSlots ? timeStringToDate(time, new Date(selectedDate + 'T00:00:00')) : null;
      if (recipeMode) {
        // Building a recipe: each ingredient goes in as its own ingredient.
        for (const ing of scaledIngredients) {
          await onAddFood({
            name: ing.name, cal: ing.cal, protein: ing.protein, carbs: ing.carbs, fat: ing.fat,
            fibre: ing.fibre || 0, sodium: ing.sodium || 0, sugar: ing.sugar || 0, source: 'photo',
            servingGrams: ing.grams ? Math.round(ing.grams) : null,
            servingLabel: ing.grams ? `${Math.round(ing.grams)}g` : null,
          }, null, null);
        }
        onClose();
        return;
      }
      // The whole meal as ONE entry (the totals), keeping its ingredients so
      // expanding the entry in the log shows what it was made of.
      const grams = scaledIngredients.reduce((sum, ing) => sum + (Number(ing.grams) || 0), 0);
      const food = {
        name: mealName.trim() || result.name || 'Photo meal',
        cal: Math.round(totals.cal),
        protein: round1(totals.protein),
        carbs: round1(totals.carbs),
        fat: round1(totals.fat),
        fibre: round1(totals.fibre || 0),
        sodium: Math.round(totals.sodium || 0),
        sugar: round1(totals.sugar || 0),
        source: 'photo',
        // The sum of the ingredient weights the person saw (and may have edited).
        servingGrams: grams > 0 ? Math.round(grams) : null,
        servingLabel: result.portion || (grams > 0 ? `${Math.round(grams)}g` : null),
        ingredients: scaledIngredients.map((ing) => ({
          name: ing.name, grams: ing.grams ? Math.round(ing.grams) : null,
          cal: ing.cal, protein: ing.protein, carbs: ing.carbs, fat: ing.fat,
          fibre: ing.fibre || 0, sodium: ing.sodium || 0, sugar: ing.sugar || 0,
        })),
      };
      await onAddFood(food, showSlots ? null : meal, loggedAt);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't add this — try again.");
    } finally {
      setAdding(false);
    }
  }

  // The camera itself renders full-screen, outside the modal card entirely
  // — it's the active step and should feel like an actual camera app, not
  // a cramped preview box inside a dialog.
  // `&& !error`: a failure before the preview exists (image decode, etc.)
  // used to fall through to here and show the camera again with no sign
  // anything went wrong.
  if (!preview && !error) {
    return <CameraCapture onCapture={handleFile} hint="Line up a clear, well-lit shot" fullScreen onClose={close} />;
  }

  // The captured photo stays full-screen through the analyzing wait too —
  // shrinking it into a small card immediately after a full-screen camera
  // read as an abrupt, "cropped" downgrade. Once there's an actual result
  // or error to show, the sheet below takes over since there's real
  // content (macros, retry actions) that needs a scrollable layout.
  if (!result && !error) {
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
            Analyzing photo…
          </div>
        )}
      </div>
    );
  }

  // Something went wrong (or the cap was hit): its own page, with the way on.
  if (error && !result) {
    return (
      <ScanErrorPage
        title="Photo scan" error={error} limitReached={limitReached} closing={closing}
        onBack={close} onUpgrade={() => navigate('/pricing')} onRetry={reset} onSearchManually={onSearchManually}
      />
    );
  }

  return (
    <PhotoResult
      preview={preview} result={result} mealName={mealName} setMealName={setMealName}
      ingredients={ingredients} scaledIngredients={scaledIngredients} totals={totals}
      onGramsChange={updateIngredientGrams} onRemoveItem={removeIngredient} onAddItem={addManualIngredient}
      meal={meal} setMeal={setMeal} time={time} setTime={setTime} showSlots={showSlots} recipeMode={recipeMode}
      dailyTarget={dailyTarget} consumed={{ cal: consumedToday, protein: consumedProtein }}
      comment={comment} setComment={setComment} commentRef={commentRef} correcting={correcting} correctionError={correctionError}
      voice={{ recording: voiceRecording, transcribing: voiceTranscribing, error: voiceError, start: startVoice, stop: stopVoice }}
      onRecalculate={handleRecalculateClick}
      labelVisible={!!result?.labelVisible} readingLabel={readingLabel} labelError={labelError} onReadLabel={handleReadLabel}
      hasCorrected={hasCorrected}
      onCreateCustom={onCreateCustom ? () => onCreateCustom({ name: result.name, portion: result.portion, cal: totals.cal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat }) : null}
      onRetake={reset} onClose={close} closing={closing} onAdd={handleAdd} adding={adding} error={error}
    />
  );
}
