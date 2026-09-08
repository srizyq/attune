import { useState } from 'react';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';

// Downscale + re-encode before upload — same reasoning as PhotoScanModal's
// resizeImage.
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
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl, base64: dataUrl.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// Re-estimates an already-logged food from a brand new photo — for when
// the first estimate (however it was originally logged: search, scan, a
// different photo) was off and a fresh, clearer shot would do better than
// hand-editing numbers. Deliberately narrow: no meal/time picker (the
// entry's existing meal/time is untouched, only its nutrition changes),
// no correction/custom-food flow — those already exist on the original
// scan modals. This is purely "try again with a better photo."
export default function RecalculatePhotoModal({ itemName, onClose, onApply }) {
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [applying, setApplying] = useState(false);
  const { closing, close } = useClosingTransition(onClose);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setLimitReached(false);
    setResult(null);
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

  function retake() {
    setPreview(null);
    setResult(null);
    setError(null);
    setLimitReached(false);
  }

  async function handleApply() {
    if (!result) return;
    setApplying(true);
    try {
      await onApply(result);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save this — try again.");
    } finally {
      setApplying(false);
    }
  }

  if (!preview) {
    return <CameraCapture onCapture={handleFile} hint={itemName ? `A clearer shot of ${itemName}` : 'Line up a clear, well-lit shot'} fullScreen onClose={close} />;
  }

  if (!result && !error) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <button
          onClick={close}
          aria-label="Close"
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
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e8e8e8' }}>Recalculate from photo</span>
          <button onClick={close} style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <img src={preview} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />

          {error && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ background: limitReached ? '#1a1508' : '#1a0f0f', border: `1px solid ${limitReached ? '#4a3a1a' : '#c0707040'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: limitReached ? '#e8c468' : '#c07070', marginBottom: 10 }}>{error}</div>
              <button onClick={retake} style={{ width: '100%', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '9px', fontSize: 13, color: '#ccc', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Try another photo
              </button>
            </div>
          )}

          {result && (
            <div>
              <div style={{ fontSize: 11, color: '#e8c468', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-sparkles" /> New estimate — {result.confidence || 'medium'} confidence
              </div>
              <div style={{ background: '#181818', border: '1px solid #3a5a3a', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: '#e8e8e8', fontWeight: 600, marginBottom: 2 }}>{result.name}</div>
                {result.portion && <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 10 }}>{result.portion}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#8fbc8f' }}>{result.cal}</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>kcal</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#8fbc8f' }}>{result.protein}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Protein</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#6aabcf' }}>{result.carbs}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Carbs</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#9f97e8' }}>{result.fat}g</div><div style={{ fontSize: 10, color: '#8a8a8a' }}>Fat</div></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={retake} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '11px', fontSize: 13, color: '#ccc', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Retake
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  style={{ flex: 2, background: applying ? '#2a2a2a' : '#8fbc8f', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, color: applying ? '#666' : '#0f0f0f', cursor: applying ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {applying ? 'Saving…' : 'Use this estimate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
