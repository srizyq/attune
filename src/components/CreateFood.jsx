import { useEffect, useRef, useState } from 'react';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { macroKcal, calorieMatch, matchTone, labelToForm, weightStep } from '../lib/customFood';
import { readNutritionLabel } from '../lib/labelScan';
import { validateImageFile } from '../lib/bodyProgress';
import { sumFoodItems } from '../lib/foodMath';
import CameraCapture from './CameraCapture';
import { ScanPage, ScanCard, Eyebrow, PillButton, PillRow, PrimaryButton, GhostButton, IconTile } from './scan/ScanKit';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const input = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 46, background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 14,
  padding: '0 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
};
const cap = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };

// A small ring showing how well the calories typed in agree with the macros.
function MatchRing({ pct }) {
  const tone = matchTone(pct);
  const color = tone === 'good' ? 'var(--accent-secondary)' : tone === 'none' ? 'var(--border-strong)' : 'var(--macro-carbs)';
  const r = 26, c = 2 * Math.PI * r;
  const shown = pct == null ? 0 : Math.min(100, pct);
  return (
    <div role="img" aria-label={pct == null ? 'Calories and macros: nothing to compare yet' : `Calories match the macros ${pct} percent`} style={{ position: 'relative', width: 68, height: 68, flexShrink: 0 }}>
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--chip-bg)" strokeWidth="7" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(shown / 100) * c} ${c}`} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{pct == null ? '—' : `${pct}%`}</span>
    </div>
  );
}

function MacroInput({ label, short, color, value, onChange, kcal, note }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />{short}
      </div>
      <input
        type="number" inputMode="decimal" min="0" step="any" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...input, minHeight: 50, padding: '0 4px', textAlign: 'center', fontSize: 18, fontWeight: 800 }}
      />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{note || `${kcal} kcal`}</div>
    </div>
  );
}

// "Create custom food" as a full page. Everything is in per-serving numbers. With
// macro auto-calculate on, calories fill themselves from protein, carbs and fat;
// switch it off to type calories in yourself (the ring then shows how closely they
// agree with the macros). It can read a nutrition label, log the food straight away
// to a meal, and — if you like — also save it as a recipe card with a photo.
//   onSave(food)            -> saves it as a custom food
//   onLog(food, meal)       -> adds it to the log (omitted while a recipe is being built)
//   slotTime                -> '12:30 PM' for people who log by time slots: no meal chips, logs at that time
//   recipeCard              -> { atLimit, photosSupported, create(name, items, servings, extras), uploadPhoto(file) } or null
export default function CreateFood({ onClose, onSave, onLog, initialName, initialFood, defaultMeal, slotTime = null, recipeCard }) {
  const { closing, close } = useClosingTransition(onClose);
  const [name, setName] = useState(initialFood?.name || initialName || '');
  const [brand, setBrand] = useState('');
  const [servingLabel, setServingLabel] = useState(initialFood?.portion || '1 serving');
  const [grams, setGrams] = useState('');
  const [cal, setCal] = useState(initialFood?.cal != null ? String(initialFood.cal) : '');
  const [protein, setProtein] = useState(initialFood?.protein != null ? String(initialFood.protein) : '');
  const [carbs, setCarbs] = useState(initialFood?.carbs != null ? String(initialFood.carbs) : '');
  const [fat, setFat] = useState(initialFood?.fat != null ? String(initialFood.fat) : '');
  const [fibre, setFibre] = useState('');
  const [sodium, setSodium] = useState('');
  const [sugar, setSugar] = useState('');
  // A scan result arrives with its own calories, which should be kept; a blank form calculates them.
  const [auto, setAuto] = useState(initialFood?.cal == null);
  const [meal, setMeal] = useState(defaultMeal || 'Lunch');
  const [microsOpen, setMicrosOpen] = useState(false);
  const [asRecipe, setAsRecipe] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoProblem, setPhotoProblem] = useState(null);
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [labelError, setLabelError] = useState(null);
  const [saving, setSaving] = useState(null);       // 'save' | 'log' while a save is running
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const kcal = macroKcal({ protein, carbs, fat });
  const calories = auto ? kcal.total : (cal === '' ? '' : Number(cal));
  const match = calorieMatch(auto ? kcal.total : cal, kcal.total);
  const valid = name.trim() && (auto || (cal !== '' && Number(cal) >= 0));
  const recipeOn = !!recipeCard && asRecipe && !recipeCard.atLimit;

  function food() {
    return {
      name: name.trim(), brand: brand.trim() || null, servingLabel: servingLabel.trim() || '1 serving',
      servingGrams: grams ? Number(grams) : null,
      cal: Number(calories) || 0, protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0,
      fibre: Number(fibre) || 0, sodium: Number(sodium) || 0, sugar: Number(sugar) || 0,
    };
  }

  async function submit(andLog) {
    if (!valid || saving) return;
    setSaving(andLog ? 'log' : 'save');
    setError(null);
    const f = food();
    try {
      await onSave(f);
      if (recipeOn) {
        const photoPath = photoFile && recipeCard.photosSupported ? await recipeCard.uploadPhoto(photoFile) : undefined;
        const item = { name: f.name, servingGrams: f.servingGrams, loggedAmount: 1, loggedUnit: 'serving', ...sumFoodItems([f]) };
        await recipeCard.create(f.name, [item], 1, photoPath ? { photoPath } : {});
      }
      if (andLog && onLog) await onLog(f, meal);
      close();
    } catch (err) {
      console.error(err);
      setError("Couldn't save this food. Try again.");
    } finally {
      setSaving(null);
    }
  }

  async function readLabel(file) {
    setCamera(false);
    setReading(true);
    setLabelError(null);
    try {
      const v = labelToForm(await readNutritionLabel(file));
      if (v.servingLabel) setServingLabel(v.servingLabel);
      if (v.servingGrams) setGrams(v.servingGrams);
      setProtein(v.protein); setCarbs(v.carbs); setFat(v.fat); setFibre(v.fibre); setSodium(v.sodium); setSugar(v.sugar);
      // The label's own calories are the truth, so they replace the calculation.
      if (v.cal !== '') { setCal(v.cal); setAuto(false); }
      if (v.sodium || v.sugar) setMicrosOpen(true);
    } catch (err) {
      setLabelError(err.message);
    } finally {
      setReading(false);
    }
  }

  function choosePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = validateImageFile(file);
    if (bad) { setPhotoProblem(bad); return; }
    setPhotoProblem(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  if (camera) return <CameraCapture onCapture={readLabel} hint="Fit the whole nutrition panel in frame" fullScreen onClose={() => setCamera(false)} />;

  const g = Number(grams) || 0;
  const step = weightStep(g);

  return (
    <ScanPage
      title="Create custom food" onBack={close} closing={closing} testId="create-food"
      footer={(
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <PrimaryButton onClick={() => submit(false)} disabled={!valid || !!saving}>
            <i className="ti ti-bookmark-plus" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
            {saving === 'save' ? 'Saving…' : 'Save to My Foods'}
          </PrimaryButton>
          {onLog && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <GhostButton onClick={() => submit(true)} disabled={!valid || !!saving} style={{ opacity: !valid || saving ? 0.5 : 1 }}>
                <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 16 }} /> {saving === 'log' ? 'Saving…' : `Save & log immediately ${slotTime ? `at ${slotTime}` : `to ${meal}`}`}
              </GhostButton>
            </div>
          )}
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <PillButton active={auto} onClick={() => { setAuto((a) => { if (a && cal === '' && kcal.total) setCal(String(kcal.total)); return !a; }); }} aria-label="Macro auto-calculate">
          <i className="ti ti-bolt" aria-hidden="true" style={{ marginRight: 6 }} />Macro auto-calculate
        </PillButton>
        <PillButton active={false} onClick={() => setCamera(true)} aria-label="Scan label" disabled={reading}>
          <i className="ti ti-barcode" aria-hidden="true" style={{ marginRight: 6 }} />{reading ? 'Reading label…' : 'Scan label'}
        </PillButton>
      </div>
      {labelError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '-6px 2px 12px' }}>{labelError}</div>}

      <ScanCard>
        <label htmlFor="cf-name" style={cap}>Food title *</label>
        <div style={{ position: 'relative' }}>
          <input id="cf-name" style={{ ...input, paddingRight: 40 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mum's lasagna" maxLength={80} />
          {name.trim() && <i className="ti ti-circle-check" aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-secondary)', fontSize: 18 }} />}
        </div>

        {onLog && !slotTime && (
          <div style={{ marginTop: 14 }}>
            <span style={cap}>Tag to meal</span>
            <PillRow label="Meal" wrap>
              {MEALS.map((m) => <PillButton key={m} active={meal === m} onClick={() => setMeal(m)}>{m}</PillButton>)}
            </PillRow>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
          <div>
            <label htmlFor="cf-brand" style={cap}>Brand / source</label>
            <input id="cf-brand" style={input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Homemade / Brand" />
          </div>
          <div>
            <label htmlFor="cf-serving" style={cap}>Unit / portion</label>
            <input id="cf-serving" style={input} value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} placeholder="1 serving" />
          </div>
        </div>
      </ScanCard>

      <ScanCard style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Base weight equivalent</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Lets you log it in grams, ounces and more</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button type="button" aria-label="Decrease weight" onClick={() => setGrams(String(Math.max(0, g - step)))} style={stepBtn}>−</button>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, minWidth: 58, justifyContent: 'center' }}>
            <input type="number" inputMode="decimal" min="0" aria-label="Serving weight in grams" value={grams} placeholder="—" onChange={(e) => setGrams(e.target.value)} style={{ width: 48, background: 'none', border: 'none', textAlign: 'right', color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, outline: 'none', fontFamily: 'inherit', padding: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>g</span>
          </span>
          <button type="button" aria-label="Increase weight" onClick={() => setGrams(String(g + step))} style={stepBtn}>+</button>
        </div>
      </ScanCard>

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <span style={cap}>Caloric density</span>
            {auto ? (
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05, color: 'var(--text-primary)' }} aria-label={`Calories ${kcal.total}`}>{kcal.total}<span style={{ fontSize: 15, fontWeight: 700, marginLeft: 4 }}>kcal</span></div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" inputMode="decimal" min="0" step="any" aria-label="Calories" value={cal} onChange={(e) => setCal(e.target.value)} placeholder="0"
                  style={{ width: 120, background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 12, minHeight: 48, padding: '0 10px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>kcal</span>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-sparkles" aria-hidden="true" style={{ color: 'var(--accent-secondary)' }} />
              {auto ? 'Live calculated via macros' : 'Typed in — the ring shows how it matches the macros'}
            </div>
          </div>
          <MatchRing pct={match} />
        </div>
        {!auto && match != null && match < 85 && kcal.total > 0 && (
          <div role="status" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            These calories differ from what the macros add up to ({kcal.total} kcal). Check the label, or switch on auto-calculate.
          </div>
        )}
      </ScanCard>

      <ScanCard>
        <Eyebrow style={{ marginBottom: 12 }}>Macronutrients (g)</Eyebrow>
        <div style={{ display: 'flex', gap: 8 }}>
          <MacroInput label="Protein (g)" short="PRO" color="var(--macro-protein)" value={protein} onChange={setProtein} kcal={kcal.protein} />
          <MacroInput label="Carbs (g)" short="CARB" color="var(--macro-carbs)" value={carbs} onChange={setCarbs} kcal={kcal.carbs} />
          <MacroInput label="Fat (g)" short="FAT" color="var(--macro-fat)" value={fat} onChange={setFat} kcal={kcal.fat} />
          <MacroInput label="Fibre (g)" short="FBR" color="var(--text-muted)" value={fibre} onChange={setFibre} note="Dietary" />
        </div>
      </ScanCard>

      <ScanCard style={{ padding: 0 }}>
        <button type="button" onClick={() => setMicrosOpen((o) => !o)} aria-expanded={microsOpen}
          style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)', fontSize: 14, fontWeight: 800 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-adjustments-horizontal" aria-hidden="true" /> Detailed micronutrients (optional)</span>
          <i className={`ti ti-chevron-${microsOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {microsOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '0 16px 16px' }}>
            <div><label htmlFor="cf-sodium" style={cap}>Sodium (mg)</label><input id="cf-sodium" style={input} type="number" inputMode="decimal" min="0" value={sodium} onChange={(e) => setSodium(e.target.value)} /></div>
            <div><label htmlFor="cf-sugar" style={cap}>Sugar (g)</label><input id="cf-sugar" style={input} type="number" inputMode="decimal" min="0" value={sugar} onChange={(e) => setSugar(e.target.value)} /></div>
          </div>
        )}
      </ScanCard>

      {recipeCard && (
        <ScanCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input ref={fileRef} type="file" accept="image/*" aria-label="Choose a recipe card photo" onChange={choosePhoto} style={{ display: 'none' }} />
            {recipeCard.photosSupported ? (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={photoPreview ? 'Change photo' : 'Add photo'} style={{ width: 52, height: 52, flexShrink: 0, padding: 0, border: 'none', borderRadius: 14, overflow: 'hidden', background: 'var(--chip-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>
                {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <i className="ti ti-photo-plus" aria-hidden="true" />}
              </button>
            ) : <IconTile icon="ti-bookmark" size={52} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Save as recipe card</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {recipeCard.atLimit ? 'You\'ve used your free recipes — upgrade for more.' : recipeCard.photosSupported ? 'Also add it to Recipes, with a photo if you like' : 'Also add it to Recipes'}
              </div>
            </div>
            <button type="button" role="switch" aria-checked={recipeOn} aria-label="Save as recipe card" disabled={recipeCard.atLimit} onClick={() => setAsRecipe((v) => !v)}
              style={{ width: 52, height: 32, flexShrink: 0, borderRadius: 99, border: 'none', padding: 3, cursor: recipeCard.atLimit ? 'not-allowed' : 'pointer', background: recipeOn ? 'var(--accent)' : 'var(--border-strong)', display: 'flex', justifyContent: recipeOn ? 'flex-end' : 'flex-start', opacity: recipeCard.atLimit ? 0.5 : 1 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff' }} />
            </button>
          </div>
          {photoProblem && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{photoProblem}</div>}
        </ScanCard>
      )}
    </ScanPage>
  );
}

const stepBtn = { width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'var(--chip-bg)', color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' };
