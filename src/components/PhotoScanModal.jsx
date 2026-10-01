import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeStringToDate, formatTime12h } from '../lib/mealTime';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { targetsForDate } from '../lib/dayTargets';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';
import DragSheet from './DragSheet';
import MacroBreakdown from './MacroBreakdown';
import DayBudgetImpact from './DayBudgetImpact';
import TargetIntervalPicker from './TargetIntervalPicker';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

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

function IngredientRow({ ingredient, onGramsChange, last }) {
  const scaled = scaleIngredient(ingredient);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--border-default)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ingredient.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{scaled.cal} kcal · {scaled.protein}g P · {scaled.carbs}g C · {scaled.fat}g F</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={ingredient.grams}
          onChange={e => onGramsChange(e.target.value)}
          aria-label={`${ingredient.name} weight in grams`}
          style={{ width: 54, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '6px', color: 'var(--text-primary)', fontSize: 13, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>g</span>
      </div>
    </div>
  );
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

function MicroStat({ value, unit, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{value ?? 0}{unit}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function PhotoScanModal({ onClose, onAddFood, defaultMeal, defaultTime, selectedDate, showSlots, onCreateCustom, onSearchManually }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [hasCorrected, setHasCorrected] = useState(false);
  // Separate from the main `error`/`limitReached` pair so a failed
  // correction attempt doesn't blow away the perfectly good result
  // already on screen — it shows inline near the comment box instead.
  const [correctionError, setCorrectionError] = useState(null);
  const [readingLabel, setReadingLabel] = useState(false);
  const [labelError, setLabelError] = useState(null);
  const [showMicros, setShowMicros] = useState(false);
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

  function updateIngredientGrams(index, raw) {
    const grams = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    setIngredients(prev => prev.map((ing, i) => (i === index ? { ...ing, grams } : ing)));
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
    try {
      const { dataUrl, base64 } = await resizeImage(file);
      setPreview(dataUrl);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/recognize-food', {
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
      const res = await fetch('/api/recognize-food', {
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
      const res = await fetch('/api/recognize-label', {
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

  async function handleAdd() {
    if (!result || scaledIngredients.length === 0) return;
    setAdding(true);
    try {
      // Separate entries — chicken, rice, sauce each land as their own row
      // in today's log, editable independently like any other food.
      for (const ing of scaledIngredients) {
        const food = {
          name: ing.name,
          cal: ing.cal,
          protein: ing.protein,
          carbs: ing.carbs,
          fat: ing.fat,
          fibre: ing.fibre || 0,
          sodium: ing.sodium || 0,
          sugar: ing.sugar || 0,
          source: 'photo',
          // Unlike the old single-blob estimate, this weight passed
          // through the user's own edit (or was left at the AI's
          // estimate on purpose) — safe to carry as a real servingGrams.
          servingGrams: ing.grams ? Math.round(ing.grams) : null,
          servingLabel: ing.grams ? `${Math.round(ing.grams)}g` : null,
        };
        await onAddFood(food, showSlots ? null : meal, showSlots ? timeStringToDate(time, new Date(selectedDate + 'T00:00:00')) : null);
      }
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
  if (!preview) {
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
          ✕
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

  return (
    <DragSheet title="Scan food photo" onClose={close} closing={closing}>
      <img src={preview} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />

      {analyzing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          Analyzing photo…
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: limitReached ? '#1a1508' : '#1a0f0f', border: `1px solid ${limitReached ? '#4a3a1a' : '#c0707040'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: limitReached ? 'var(--gold)' : 'var(--danger)', marginBottom: 10 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {limitReached ? (
              <button onClick={() => navigate('/settings')} style={{ flex: 1, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '9px', fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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

      {result && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-sparkles" /> AI estimate — {result.confidence || 'medium'} confidence
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>{result.name}</div>
            {result.portion && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{result.portion}</div>}
            <MacroBreakdown values={totals} />
            <button
              onClick={() => setShowMicros(s => !s)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12, padding: '6px 0 0' }}
            >
              {showMicros ? 'Hide' : 'Show'} fibre, sodium & sugar
              <i className={`ti ti-chevron-${showMicros ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
            </button>
            {showMicros && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
                <MicroStat value={totals.fibre} unit="g" label="Fibre" />
                <MicroStat value={totals.sodium} unit="mg" label="Sodium" />
                <MicroStat value={totals.sugar} unit="g" label="Sugar" />
              </div>
            )}
          </div>

          {/* Each detected component gets its own editable weight — editing
              it rescales just that component's own macros (see
              scaleIngredient), and the totals/MacroBreakdown above move
              with it live. */}
          {ingredients.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Ingredients</div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '0 14px' }}>
                {ingredients.map((ing, i) => (
                  <IngredientRow key={i} ingredient={ing} onGramsChange={(v) => updateIngredientGrams(i, v)} last={i === ingredients.length - 1} />
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
            This is a visual estimate, not verified nutrition data — review before adding, and adjust later if it's off.
          </p>

          {dailyTarget.calories > 0 && (
            <div style={{ marginBottom: 14 }}>
              <DayBudgetImpact target={dailyTarget.calories} consumed={consumedToday} adding={totals.cal} itemName={result.name} />
            </div>
          )}

          {/* The photo itself can carry a real nutrition panel (a
              packaged product shot from the front) — offering to
              re-read it via OCR gets exact printed numbers instead of
              a visual guess, using the same photo, no new capture. */}
          {result.labelVisible && (
            <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 6, lineHeight: 1.5 }}>
                This photo shows a nutrition label — read it for exact numbers instead of an estimate?
              </div>
              <button
                onClick={handleReadLabel}
                disabled={readingLabel}
                style={{
                  background: readingLabel ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 7,
                  padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  color: readingLabel ? 'var(--text-muted)' : 'var(--accent-contrast)', cursor: readingLabel ? 'not-allowed' : 'pointer',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {readingLabel ? 'Reading label…' : 'Read exact label'}
              </button>
              {labelError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{labelError}</div>}
            </div>
          )}

          {/* Always visible, not gated behind a "this is wrong" toggle —
              correcting is free (doesn't cost a scan) and can be done
              as many times as needed; each correction re-sends the
              same photo + this comment + the current estimate. A
              textarea (not a single-line input) — a real correction is
              often more than a few words ("it's a 3 egg omelette with
              170g rice, not 2 eggs and less rice"), and a cramped input
              made that awkward to type and re-read before sending. */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Not quite right? Tell it what's wrong</label>
              {voiceTranscribing && <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--text-hint)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
              {!voiceTranscribing && voiceRecording && (
                <button onClick={stopVoice} title="Stop recording" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, display: 'flex', animation: 'pulse 1.2s ease-in-out infinite' }}>
                  <i className="ti ti-player-stop-filled" />
                </button>
              )}
              {!voiceTranscribing && !voiceRecording && (
                <button onClick={startVoice} className="hit-slop" title="Speak your correction" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, display: 'flex' }}>
                  <i className="ti ti-microphone" />
                </button>
              )}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="e.g. it's chicken not fish, or it's 1.5 servings, or it's a 3 egg omelette with 170g rice"
              disabled={correcting}
              rows={3}
              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
            />
            {voiceError && <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--danger)' }}>{voiceError}</div>}
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

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
            <TargetIntervalPicker showSlots={showSlots} meal={meal} setMeal={setMeal} time={time} setTime={setTime} meals={MEALS} />
            <button onClick={reset} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}>Retake</button>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{ width: '100%', background: adding ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, color: adding ? 'var(--text-muted)' : 'var(--accent-contrast)', cursor: adding ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {adding
              ? 'Adding…'
              : `+ Add ${scaledIngredients.length > 1 ? `${scaledIngredients.length} items` : scaledIngredients[0]?.name || 'item'} ${showSlots ? `at ${formatTime12h(time)}` : `to ${meal}`}`}
          </button>
          {onCreateCustom && (
            <button onClick={() => onCreateCustom({ name: result.name, portion: result.portion, cal: totals.cal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat })} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {hasCorrected
                // Once you've corrected it, saving it as a custom food
                // means this exact dish never needs an AI guess again —
                // the whole point of the correction loop, made explicit
                // instead of requiring you to notice it's possible.
                ? 'Save as custom food — skip the AI guess next time'
                : 'Not quite right? Save as a custom food instead'}
            </button>
          )}
        </div>
      )}
    </DragSheet>
  );
}
