import { useEffect, useRef, useState } from 'react';

// Live in-app camera view, shared by PhotoScanModal and MenuScanModal —
// both used to open the OS's own file picker (a "take photo or choose
// file" sheet) instead of dropping straight into the camera the way
// BarcodeScanner already does via ZXing. This gives them the same
// direct-to-camera behavior, with "choose from library" as a secondary
// option layered on top rather than the primary path.
//
// Produces a plain File either way (a captured frame re-encoded as JPEG,
// or whatever the user picked from their library) so callers can hand it
// straight to their existing handleFile(file) pipeline unchanged — this
// component only owns "get an image", not what happens to it afterward.
//
// `fullScreen` renders the camera edge-to-edge over the whole viewport
// (a fixed overlay, not embedded in a modal card) — feels like an actual
// camera app instead of a cramped preview box. Callers switch to this
// mode only while the camera itself is the active step, then fall back
// to their own modal layout once there's a photo to review.
export default function CameraCapture({ onCapture, hint, fullScreen = false, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        console.error('Camera unavailable:', err);
        if (!cancelled) setError("Couldn't access your camera — you can still choose a photo instead.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }

  const containerStyle = fullScreen
    ? { position: 'fixed', inset: 0, zIndex: 200, background: '#000' }
    : { position: 'relative', marginBottom: 14, borderRadius: 10, overflow: 'hidden', background: '#0a0a0a', height: 260 };

  return (
    <div style={fullScreen ? { position: 'fixed', inset: 0, zIndex: 200 } : { position: 'relative', marginBottom: 14 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); }}
      />

      {!error ? (
        <div style={containerStyle}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: ready ? 'block' : 'none' }} />
          {!ready && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#555' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #333', borderTopColor: '#8fbc8f', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 12 }}>Opening camera…</div>
            </div>
          )}

          {fullScreen && onClose && (
            <button
              onClick={onClose}
              aria-label="Close camera"
              title="Close"
              style={{
                position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 16,
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}

          {ready && hint && (
            <div style={{
              position: 'absolute',
              top: fullScreen ? 'calc(24px + env(safe-area-inset-top))' : 10,
              left: 0, right: 0, textAlign: 'center',
              fontSize: fullScreen ? 13 : 11, color: '#ccc', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}>{hint}</div>
          )}
          {ready && (
            <div style={{
              position: 'absolute',
              bottom: fullScreen ? 'calc(32px + env(safe-area-inset-bottom))' : 14,
              left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Choose from library"
                title="Choose from library"
                style={{
                  position: 'absolute', left: fullScreen ? 32 : 18, width: fullScreen ? 48 : 40, height: fullScreen ? 48 : 40, borderRadius: '50%',
                  background: 'rgba(20,20,20,0.7)', border: '1px solid rgba(255,255,255,0.25)',
                  color: '#e8e8e8', fontSize: fullScreen ? 20 : 17, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <i className="ti ti-photo" />
              </button>
              <button
                onClick={capture}
                aria-label="Take photo"
                title="Take photo"
                style={{
                  width: fullScreen ? 74 : 62, height: fullScreen ? 74 : 62, borderRadius: '50%', background: '#fff',
                  border: '4px solid rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0,
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={fullScreen
          ? { position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px', textAlign: 'center' }
          : { height: 180, border: '1px dashed #2a2a2a', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 20px', textAlign: 'center' }}>
          {fullScreen && onClose && (
            <button
              onClick={onClose}
              aria-label="Close camera"
              style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(40,40,40,0.8)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
          <i className="ti ti-camera-off" style={{ fontSize: 32, color: '#555' }} />
          <div style={{ fontSize: 12, color: '#777' }}>{error}</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ marginTop: 4, background: 'var(--accent-bg, #0f1a0f)', border: '1px solid var(--border-active, #3a5a3a)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--accent, #8fbc8f)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Choose a photo
          </button>
        </div>
      )}
    </div>
  );
}
