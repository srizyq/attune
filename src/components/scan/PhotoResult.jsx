import { useState } from 'react';
import DayBudgetImpact from '../DayBudgetImpact';
import VoiceMicButton from '../VoiceMicButton';
import { formatTime12h } from '../../lib/mealTime';
import { getCategoryStyle } from '../../lib/foodCategories';
import { energySplit, percentOf, plateInsight, DAILY_VALUES } from '../../lib/scanInsights';
import SeeDetails from '../FoodDetails';
import {
  ScanPage, ScanCard, Eyebrow, Chip, InsightCard, SplitBar, MacroTile, PillButton, PillRow,
  PrimaryButton, GhostButton, IconTile,
} from './ScanKit';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const fieldStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 12,
  padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// "High match" etc. — the average of the per-item match scores when the AI
// gave them, else its overall confidence word.
function matchSummary(result, ingredients) {
  const scores = ingredients.map(i => i.match).filter(m => Number.isFinite(m));
  if (scores.length) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return `${avg}% match`;
  }
  const c = result?.confidence;
  return c ? `${c.charAt(0).toUpperCase()}${c.slice(1)} confidence` : null;
}

// A small form for an item the AI missed: you type what it weighs and what is
// in it, and it joins the plate like any detected item.
function AddItemForm({ onAdd, onCancel }) {
  const [v, setV] = useState({ name: '', grams: '', cal: '', protein: '', carbs: '', fat: '' });
  const set = (k) => (e) => setV(prev => ({ ...prev, [k]: e.target.value }));
  const ok = v.name.trim() && Number(v.cal) >= 0 && v.cal !== '';
  return (
    <ScanCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={fieldStyle} placeholder="Item name" aria-label="New item name" value={v.name} onChange={set('name')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <input style={fieldStyle} type="number" inputMode="decimal" placeholder="Weight (g)" aria-label="New item weight in grams" value={v.grams} onChange={set('grams')} />
          <input style={fieldStyle} type="number" inputMode="decimal" placeholder="Calories" aria-label="New item calories" value={v.cal} onChange={set('cal')} />
          <input style={fieldStyle} type="number" inputMode="decimal" placeholder="Protein (g)" aria-label="New item protein" value={v.protein} onChange={set('protein')} />
          <input style={fieldStyle} type="number" inputMode="decimal" placeholder="Carbs (g)" aria-label="New item carbs" value={v.carbs} onChange={set('carbs')} />
          <input style={fieldStyle} type="number" inputMode="decimal" placeholder="Fat (g)" aria-label="New item fat" value={v.fat} onChange={set('fat')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <GhostButton onClick={onCancel} style={{ flex: 1, border: '1px solid var(--border-strong)' }}>Cancel</GhostButton>
        <PrimaryButton disabled={!ok} onClick={() => onAdd(v)} style={{ flex: 2, minHeight: 44, borderRadius: 14, fontSize: 14 }}>Add to plate</PrimaryButton>
      </div>
    </ScanCard>
  );
}

function ItemCard({ ingredient, scaled, onGramsChange, onRemove, canRemove }) {
  const cat = getCategoryStyle({ name: ingredient.name });
  const step = (d) => onGramsChange(String(Math.max(0, Math.round((Number(ingredient.grams) || 0) + d))));
  return (
    <ScanCard style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <IconTile icon={cat.icon} color={cat.color} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere', minWidth: 0 }}>{ingredient.name}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {scaled.cal}<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 3 }}>kcal</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', marginTop: 6 }}>
            {Number.isFinite(ingredient.match) && <Chip color="var(--accent-secondary)">{ingredient.match}% match</Chip>}
            {ingredient.portion && <span style={{ fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{ingredient.portion}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: 'var(--macro-protein)' }}>P: {scaled.protein}g</span>
            <span style={{ color: 'var(--macro-carbs)' }}>C: {scaled.carbs}g</span>
            <span style={{ color: 'var(--macro-fat)' }}>F: {scaled.fat}g</span>
          </div>
          <SeeDetails food={{ ...scaled, name: ingredient.name, servingGrams: Number(ingredient.grams) || scaled.servingGrams || null, source: 'photo' }} style={{ marginTop: 2, padding: 0, justifyContent: 'flex-start' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, padding: '6px 6px 6px 12px', borderRadius: 14, background: 'var(--chip-bg)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Portion</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-label={`Decrease ${ingredient.name}`} onClick={() => step(-10)} className="hit-slop" style={stepBtn}>−</button>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
            <input
              type="number" min="0" inputMode="decimal" value={ingredient.grams}
              onChange={e => onGramsChange(e.target.value)}
              aria-label={`${ingredient.name} weight in grams`}
              style={{ width: 52, background: 'none', border: 'none', textAlign: 'right', color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, outline: 'none', fontFamily: 'inherit', padding: 0 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>g</span>
          </span>
          <button type="button" aria-label={`Increase ${ingredient.name}`} onClick={() => step(10)} className="hit-slop" style={stepBtn}>+</button>
          {canRemove && (
            <button type="button" aria-label={`Remove ${ingredient.name}`} onClick={onRemove} className="hit-slop" style={{ ...stepBtn, background: 'transparent', color: 'var(--text-muted)', marginLeft: 2 }}>
              <i className="ti ti-trash" aria-hidden="true" style={{ fontSize: 15 }} />
            </button>
          )}
        </div>
      </div>
    </ScanCard>
  );
}

const stepBtn = {
  width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'var(--bg-card)', color: 'var(--text-primary)',
  fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
};

// Photo scan result as a full page. Presentation only: PhotoScanModal owns
// the scan, the editable ingredients, the correction request and the log call.
export default function PhotoResult({
  preview, result, mealName, setMealName, ingredients, scaledIngredients, totals,
  onGramsChange, onRemoveItem, onAddItem,
  meal, setMeal, time, setTime, showSlots, recipeMode,
  dailyTarget, consumed,
  comment, setComment, commentRef, correcting, correctionError, voice, onRecalculate,
  labelVisible, readingLabel, labelError, onReadLabel,
  hasCorrected, onCreateCustom, onRetake, onClose, closing, onAdd, adding, error,
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [adderOpen, setAdderOpen] = useState(false);
  const hasTarget = dailyTarget.calories > 0;
  const kcal = Math.round(totals.cal);
  const pct = percentOf(kcal, dailyTarget.calories);
  const left = Math.round(dailyTarget.calories - consumed.cal);
  const split = energySplit(totals);
  const fibrePct = percentOf(totals.fibre, DAILY_VALUES.fibre);
  const synergy = plateInsight(totals, dailyTarget, consumed);
  const summary = matchSummary(result, ingredients);
  const logLabel = recipeMode
    ? `Add plate (${kcal} kcal) to recipe`
    : showSlots ? `Log plate (${kcal} kcal) at ${formatTime12h(time)}` : `Log plate (${kcal} kcal) to ${meal}`;
  const shown = scaledIngredients.slice(0, 3);

  return (
    <ScanPage
      title="Food detail" onBack={onClose} closing={closing} testId="photo-result"
      footer={(
        <>
          <PrimaryButton onClick={onAdd} disabled={adding}>
            <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adding ? (recipeMode ? 'Adding…' : 'Logging…') : logLabel}</span>
          </PrimaryButton>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <GhostButton onClick={onRecalculate} disabled={correcting} aria-label="Recalculate" style={{ opacity: correcting ? 0.6 : 1 }}>
              <i className="ti ti-refresh" aria-hidden="true" style={{ fontSize: 16 }} /> {correcting ? 'Fixing…' : 'Recalculate'}
            </GhostButton>
            <GhostButton onClick={onClose}>Cancel</GhostButton>
          </div>
        </>
      )}
    >
      <ScanCard style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' }}>
        <IconTile icon="ti-sparkles" size={40} color="var(--accent-secondary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Attune AI</span>
            {summary && <Chip color="var(--accent-secondary)">{summary}</Chip>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {ingredients.length} item{ingredients.length === 1 ? '' : 's'} detected in your photo
          </div>
        </div>
        <button type="button" aria-label="About this estimate" aria-expanded={infoOpen} onClick={() => setInfoOpen(o => !o)} className="hit-slop"
          style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <i className="ti ti-info-circle" aria-hidden="true" />
        </button>
      </ScanCard>
      {infoOpen && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '-4px 4px 12px', lineHeight: 1.5 }}>
          This is a visual estimate, not verified nutrition data. Review the items, adjust any portion that's off, and log when it looks right.
        </p>
      )}

      {preview && (
        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', marginBottom: 12, background: 'var(--bg-subtle)' }}>
          <img src={preview} alt="Your meal" style={{ display: 'block', width: '100%', maxHeight: 280, aspectRatio: '4 / 3', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            {shown.map((ing, i) => (
              <span key={i} style={{ maxWidth: '88%', padding: '4px 10px', borderRadius: 99, background: 'rgba(20,14,10,0.72)', color: '#f6f2fa', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                {ing.name} • {ing.cal} kcal
              </span>
            ))}
            {scaledIngredients.length > shown.length && (
              <span style={{ padding: '4px 10px', borderRadius: 99, background: 'rgba(20,14,10,0.72)', color: '#f6f2fa', fontSize: 12, fontWeight: 700 }}>+{scaledIngredients.length - shown.length} more</span>
            )}
          </div>
          <button type="button" onClick={onRetake} aria-label="Retake"
            style={{ position: 'absolute', left: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 99, border: 'none', background: 'rgba(20,14,10,0.72)', color: '#f6f2fa', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-camera" aria-hidden="true" style={{ fontSize: 15 }} /> Retake
          </button>
        </div>
      )}

      <ScanCard>
        <Eyebrow>Total plate energy</Eyebrow>
        <input
          type="text" value={mealName} onChange={e => setMealName(e.target.value)} maxLength={80} aria-label="Meal name"
          style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--border-strong)', outline: 'none', padding: '6px 0 4px', marginTop: 4, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
        {result.portion && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{result.portion}</div>}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05, color: 'var(--text-primary)' }}>
            {kcal}<span style={{ fontSize: 17, fontWeight: 700, marginLeft: 4 }}>kcal</span>
          </div>
          {hasTarget && pct != null && (
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <Chip color="var(--accent-secondary)" icon="ti-bolt">{pct}% of daily goal</Chip>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{fmt(Math.max(0, left))} kcal remaining</div>
            </div>
          )}
        </div>
        <SplitBar split={split} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 8, marginTop: 14 }}>
          <MacroTile kind="protein" label="Protein" value={round1(totals.protein)} note={split ? `${split.protein}% cal` : null} />
          <MacroTile kind="carbs" label="Carbs" value={round1(totals.carbs)} note={split ? `${split.carbs}% cal` : null} />
          <MacroTile kind="fat" label="Fat" value={round1(totals.fat)} note={split ? `${split.fat}% cal` : null} />
          <MacroTile kind="fibre" label="Fibre" value={round1(totals.fibre)} note={fibrePct != null ? `${fibrePct}% DV` : null} />
        </div>
        {hasTarget && (
          <div style={{ marginTop: 14 }}>
            <DayBudgetImpact target={dailyTarget.calories} consumed={consumed.cal} adding={totals.cal} />
          </div>
        )}
      </ScanCard>

      {(synergy || result.insight) && (
        <InsightCard icon="ti-heartbeat" title="Target synergy" tag="AI insight">
          {synergy && <div>{synergy.text}</div>}
          {result.insight && <div style={{ marginTop: synergy ? 6 : 0 }}>{result.insight}</div>}
        </InsightCard>
      )}

      {labelVisible && (
        <ScanCard style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
            This photo shows a nutrition label — read it for exact numbers instead of an estimate?
          </div>
          <PrimaryButton onClick={onReadLabel} disabled={readingLabel} style={{ minHeight: 44, borderRadius: 14, fontSize: 14 }}>
            {readingLabel ? 'Reading label…' : 'Read exact label'}
          </PrimaryButton>
          {labelError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{labelError}</div>}
        </ScanCard>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '16px 4px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
          Detected items <Chip>{ingredients.length}</Chip>
        </div>
        <button type="button" onClick={() => setAdderOpen(o => !o)} aria-expanded={adderOpen}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--accent-secondary)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36, padding: '0 4px' }}>
          <i className="ti ti-circle-plus" aria-hidden="true" style={{ fontSize: 17 }} /> Add item
        </button>
      </div>
      {adderOpen && <AddItemForm onAdd={(v) => { onAddItem(v); setAdderOpen(false); }} onCancel={() => setAdderOpen(false)} />}
      {ingredients.map((ing, i) => (
        <ItemCard
          key={i} ingredient={ing} scaled={scaledIngredients[i]}
          onGramsChange={(v) => onGramsChange(i, v)}
          onRemove={() => onRemoveItem(i)} canRemove={ingredients.length > 1}
        />
      ))}

      {!recipeMode && (
        <ScanCard>
          <Eyebrow style={{ marginBottom: 10 }}>{showSlots ? 'Log at' : 'Log to meal'}</Eyebrow>
          {showSlots ? (
            <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Time" style={{ ...fieldStyle, background: 'var(--chip-bg)', border: '1px solid transparent', fontWeight: 700 }} />
          ) : (
            <PillRow label="Meal" wrap>
              {MEALS.map(m => <PillButton key={m} active={meal === m} onClick={() => setMeal(m)}>{m}</PillButton>)}
            </PillRow>
          )}
        </ScanCard>
      )}

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <label htmlFor="photo-correction" style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Not quite right? Tell it what's wrong</label>
          <VoiceMicButton recording={voice.recording} transcribing={voice.transcribing} onStart={voice.start} onStop={voice.stop} title="Speak your correction" />
        </div>
        <textarea
          id="photo-correction" value={comment} onChange={e => setComment(e.target.value)} ref={commentRef} rows={3} disabled={correcting}
          placeholder="e.g. it's chicken not fish, or it's 1.5 servings, or it's a 3 egg omelette with 170g rice"
          style={{ ...fieldStyle, resize: 'vertical', fontSize: 13 }}
        />
        {voice.error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{voice.error}</div>}
        {correctionError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{correctionError}</div>}
      </ScanCard>

      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: '0 4px 12px' }}>{error}</div>}

      {onCreateCustom && (
        <button type="button" onClick={onCreateCustom}
          style={{ width: '100%', minHeight: 48, borderRadius: 16, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', marginBottom: 12 }}>
          <i className="ti ti-bookmark-plus" aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }} />
          <span>{hasCorrected ? 'Save as meal template — skip the AI guess next time' : 'Save as meal template'}</span>
        </button>
      )}
    </ScanPage>
  );
}

function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
