import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mealFromDate } from '../lib/mealTime';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { supabase } from '../lib/supabase';
import CameraCapture from './CameraCapture';
import DragSheet from './DragSheet';

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
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{pick.cal}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>kcal</div></div>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{pick.protein}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Protein</div></div>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--water-blue)' }}>{pick.carbs}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Carbs</div></div>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ai-purple)' }}>{pick.fat}g</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fat</div></div>
    </div>
  );
}

// Same pill-segmented look as DailyLogViewToggle (Dashboard's Hourly/Meals
// switch) — reused inline here rather than as a shared component since the
// two live in unrelated parts of the app with different option sets.
function TabToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2, marginBottom: 14 }}>
      {[
        { id: 'goal', label: 'For your goal', icon: 'ti-sparkles' },
        { id: 'all', label: 'All items', icon: 'ti-list' },
      ].map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 18, border: 'none',
            background: value === opt.id ? 'var(--accent)' : 'transparent',
            color: value === opt.id ? '#0f0f0f' : 'var(--text-muted)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <i className={`ti ${opt.icon}`} style={{ fontSize: 13 }} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function MenuScanModal({ onClose, onAddFood, logByTime, onSearchManually }) {
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
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [adding, setAdding] = useState(false);
  const { closing, close } = useClosingTransition(onClose);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setLimitReached(false);
    setRecommendations(null);
    setMenuItems(null);
    setPicked(null);
    setActiveTab('goal');
    setAnalyzing(true);
    try {
      const { dataUrl, base64 } = await resizeImage(file);
      setPreview(dataUrl);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/recognize-menu', {
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
    setPreview(null);
    setRecommendations(null);
    setMenuItems(null);
    setPicked(null);
    setError(null);
    setLimitReached(false);
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
        name: picked.data.name,
        cal: picked.data.cal,
        protein: picked.data.protein,
        carbs: picked.data.carbs,
        fat: picked.data.fat,
        source: 'menu',
        // No servingGrams — same reasoning as photo scan: this is an AI
        // estimate off a menu photo, not a measured weight.
      };
      const meal = mealFromDate(now);
      const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
      await onAddFood(food, logByTime ? null : mealLabel, logByTime ? now : null);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't add this — try again.");
    } finally {
      setAdding(false);
    }
  }

  const hasResults = !!(recommendations || menuItems);

  // Same pattern as PhotoScanModal — the camera is its own full-screen
  // step, not squeezed into the modal card, so it feels like an actual
  // camera rather than a small embedded preview.
  if (!preview) {
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
          style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          ✕
        </button>
        {analyzing && (
          <div style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#8fbc8f', animation: 'spin 0.8s linear infinite' }} />
            Reading the whole menu…
          </div>
        )}
      </div>
    );
  }

  return (
    <DragSheet title={picked ? 'Confirm pick' : 'Scan a menu'} onClose={close} closing={closing}>
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

      {/* Results — a "for your goal" tab of 3 ranked picks, and an "all
          items" tab covering the whole menu. Tap any card/row in either to
          review before logging. */}
      {hasResults && !picked && !error && (
        <div style={{ marginTop: 14 }}>
          <TabToggle value={activeTab} onChange={setActiveTab} />

          {activeTab === 'goal' && (
            recommendations.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Couldn't put together recommendations for this menu.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {recommendations.map((pick, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked({ kind: 'recommendation', data: pick })}
                    style={{ textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0f0f0f', background: i === 0 ? 'var(--accent)' : 'var(--border-strong)', borderRadius: 5, padding: '2px 6px' }}>#{i + 1}</span>
                      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{pick.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: hasModification(pick.modifications) ? 2 : 10, lineHeight: 1.4 }}>{pick.items}</div>
                    {hasModification(pick.modifications) && (
                      <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10 }}>Modified: {pick.modifications}</div>
                    )}
                    <MacroGrid pick={pick} />
                  </button>
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
                      {items.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => setPicked({ kind: 'item', data: item })}
                          style={{ textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
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
                      ))}
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
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>{picked.data.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: hasModification(picked.data.modifications) ? 2 : 10, lineHeight: 1.4 }}>
              {picked.kind === 'recommendation' ? picked.data.items : (picked.data.description || picked.data.section)}
            </div>
            {picked.kind === 'recommendation' && hasModification(picked.data.modifications) && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10 }}>Modified: {picked.data.modifications}</div>
            )}
            <MacroGrid pick={picked.data} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
            This is an AI estimate based on the menu photo, not verified nutrition data — review before adding.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPicked(null)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, padding: '11px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {picked.kind === 'recommendation' ? 'Back to options' : 'Back to menu'}
            </button>
            <button
              onClick={handleLog}
              disabled={adding}
              style={{ flex: 2, background: adding ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, color: adding ? 'var(--text-muted)' : '#0f0f0f', cursor: adding ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {adding ? 'Adding…' : 'Confirm & log'}
            </button>
          </div>
        </div>
      )}
    </DragSheet>
  );
}
