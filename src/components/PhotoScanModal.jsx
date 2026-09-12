import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeStringToDate, formatTime12h } from '../lib/mealTime';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

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

export default function PhotoScanModal({ onClose, onAddFood, defaultMeal, defaultTime, selectedDate, logByTime, onCreateCustom, onSearchManually }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
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
  const { closing, close } = useClosingTransition(onClose);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setLimitReached(false);
    setResult(null);
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
    if (!preview) return;
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
      setResult(prev => ({
        ...prev,
        portion: data.serving || prev.portion,
        cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat,
        confidence: 'high',
        labelVisible: false,
      }));
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
    setError(null);
    setLimitReached(false);
    setComment('');
    setCorrectionError(null);
    setHasCorrected(false);
    setLabelError(null);
  }

  async function handleAdd() {
    if (!result) return;
    setAdding(true);
    try {
      const food = {
        name: result.name,
        cal: result.cal,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        source: 'photo',
        // Deliberately no servingGrams — an AI portion estimate isn't a
        // real measured weight, so downstream editing correctly falls
        // back to relative-only scaling instead of pretending precision.
      };
      await onAddFood(food, logByTime ? null : meal, logByTime ? timeStringToDate(time, new Date(selectedDate + 'T00:00:00')) : null);
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
  // or error to show, the normal modal card takes over since there's real
  // content (macros, retry actions) that needs a scrollable layout.
  if (!result && !error) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <button
          onClick={close}
          aria-label="Close"
          title="Close"
          style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          ✕
        </button>
        {analyzing && (
          <div style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#8fbc8f', animation: 'spin 0.8s linear infinite' }} />
            Analyzing photo…
          </div>
        )}
      </div>
    );
  }

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e1e1e', position: 'sticky', top: 0, background: '#141414', zIndex: 10 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e8e8e8' }}>Scan food photo</span>
          <button onClick={close} style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <img src={preview} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />

          {analyzing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px 0', color: '#8a8a8a', fontSize: 13 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #333', borderTopColor: '#8fbc8f', animation: 'spin 0.8s linear infinite' }} />
              Analyzing photo…
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: limitReached ? '#1a1508' : '#1a0f0f', border: `1px solid ${limitReached ? '#4a3a1a' : '#c0707040'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: limitReached ? '#e8c468' : '#c07070', marginBottom: 10 }}>{error}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {limitReached ? (
                  <button onClick={() => navigate('/settings')} style={{ flex: 1, background: '#0f1a0f', border: '1px solid #3a5a3a', borderRadius: 8, padding: '9px', fontSize: 13, color: '#8fbc8f', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Upgrade to Pro
                  </button>
                ) : (
                  <button onClick={reset} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '9px', fontSize: 13, color: '#ccc', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Try another photo
                  </button>
                )}
                {onSearchManually && (
                  <button onClick={onSearchManually} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '9px', fontSize: 13, color: '#ccc', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Search manually
                  </button>
                )}
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: '#e8c468', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-sparkles" /> AI estimate — {result.confidence || 'medium'} confidence
              </div>
              <div style={{ background: '#181818', border: '1px solid #3a5a3a', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: '#e8e8e8', fontWeight: 600, marginBottom: 2 }}>{result.name}</div>
                {result.portion && <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 10 }}>{result.portion}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#8fbc8f' }}>{result.cal}</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>kcal</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#8fbc8f' }}>{result.protein}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Protein</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#6aabcf' }}>{result.carbs}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Carbs</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#9f97e8' }}>{result.fat}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Fat</div></div>
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#8a8a8a', margin: '0 0 14px', lineHeight: 1.5 }}>
                This is a visual estimate, not verified nutrition data — review before adding, and adjust later if it's off.
              </p>

              {/* The photo itself can carry a real nutrition panel (a
                  packaged product shot from the front) — offering to
                  re-read it via OCR gets exact printed numbers instead of
                  a visual guess, using the same photo, no new capture. */}
              {result.labelVisible && (
                <div style={{ background: '#0f1a0f', border: '1px solid #3a5a3a', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#8fbc8f', marginBottom: 6, lineHeight: 1.5 }}>
                    This photo shows a nutrition label — read it for exact numbers instead of an estimate?
                  </div>
                  <button
                    onClick={handleReadLabel}
                    disabled={readingLabel}
                    style={{
                      background: readingLabel ? '#2a2a2a' : '#8fbc8f', border: 'none', borderRadius: 7,
                      padding: '7px 14px', fontSize: 12, fontWeight: 600,
                      color: readingLabel ? '#8a8a8a' : '#0f0f0f', cursor: readingLabel ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {readingLabel ? 'Reading label…' : 'Read exact label'}
                  </button>
                  {labelError && <div style={{ marginTop: 8, fontSize: 12, color: '#c07070' }}>{labelError}</div>}
                </div>
              )}

              {/* Always visible, not gated behind a "this is wrong" toggle —
                  correcting is free (doesn't cost a scan) and can be done
                  as many times as needed; each correction re-sends the
                  same photo + this comment + the current estimate. */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: '#8a8a8a', marginBottom: 5, display: 'block' }}>Not quite right? Tell it what's wrong</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCorrect(); }}
                    placeholder="e.g. it's chicken not fish, or it's 1.5 servings"
                    disabled={correcting}
                    style={{ flex: 1, background: '#181818', border: '1px solid #2a2a2a', borderRadius: 7, padding: '9px 12px', color: '#e8e8e8', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleCorrect}
                    disabled={!comment.trim() || correcting}
                    style={{
                      background: !comment.trim() || correcting ? '#2a2a2a' : '#0f1a0f',
                      border: `1px solid ${!comment.trim() || correcting ? '#2a2a2a' : '#3a5a3a'}`,
                      borderRadius: 7, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                      color: !comment.trim() || correcting ? '#666' : '#8fbc8f',
                      cursor: !comment.trim() || correcting ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                    }}
                  >
                    {correcting ? 'Fixing…' : 'Recalculate'}
                  </button>
                </div>
                {correctionError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#c07070' }}>{correctionError}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {logByTime ? (
                  <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ flex: 1, background: '#181818', border: '1px solid #2a2a2a', borderRadius: 7, padding: '7px 10px', color: '#ccc', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                ) : (
                  <select value={meal} onChange={e => setMeal(e.target.value)} style={{ flex: 1, background: '#181818', border: '1px solid #2a2a2a', borderRadius: 7, padding: '7px 10px', color: '#ccc', fontSize: 13, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {MEALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <button onClick={reset} style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#8a8a8a', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Retake</button>
              </div>
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{ width: '100%', background: adding ? '#2a2a2a' : '#8fbc8f', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, color: adding ? '#666' : '#0f0f0f', cursor: adding ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                {adding ? 'Adding…' : logByTime ? `+ Add at ${formatTime12h(time)}` : `+ Add to ${meal}`}
              </button>
              {onCreateCustom && (
                <button onClick={() => onCreateCustom(result)} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#8a8a8a', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
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
        </div>
      </div>
    </div>
  );
}
