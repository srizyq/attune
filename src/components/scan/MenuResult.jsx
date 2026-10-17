import DayBudgetImpact from '../DayBudgetImpact';
import VoiceMicButton from '../VoiceMicButton';
import { SourcePill, PortionRow, PortionSkeleton, IncludesRow, QuickTweaks } from '../MenuPickDetails';
import { dishLabel, isHighProtein, isLowCarb, menuAdvice } from '../../lib/scanInsights';
import {
  ScanPage, ScanCard, Eyebrow, Chip, InsightCard, MacroTile, PillButton, PillRow,
  PrimaryButton, GhostButton, IconTile, SelectDot,
} from './ScanKit';

// The model sometimes says "None" instead of null when nothing was modified.
function hasModification(text) {
  return !!text && !/^(none|no modifications?|n\/a|as listed|as-is)\.?$/i.test(text.trim());
}

const FILTERS = [
  { id: 'all', label: 'All dishes' },
  { id: 'goal', label: 'Top goal matches' },
  { id: 'protein', label: 'High protein' },
  { id: 'carb', label: 'Low carb' },
];

const fieldStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 12,
  padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

// One number in the calories / protein / carbs / fats strip of a ranked dish.
function Stat({ label, value, unit = '', color }) {
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: color ? `color-mix(in srgb, ${color} 72%, var(--text-primary))` : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2, whiteSpace: 'nowrap' }}>{value}{unit}</div>
    </div>
  );
}

function RankedCard({ pick, rank, checked, mealLabel, onToggle, onOpen, onLog, busy }) {
  const label = dishLabel(pick);
  const top = rank === 0;
  return (
    <ScanCard style={{ padding: 14, borderColor: checked ? 'var(--accent)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          <Chip color="var(--accent-secondary)" icon={top ? 'ti-circle-check' : undefined}>
            {top ? 'Top goal fit' : label || 'Good fit'}{Number.isFinite(pick.match) ? ` • ${pick.match}% match` : ''}
          </Chip>
          <Chip>#{rank + 1}{top ? ' recommended' : ' ranked'}</Chip>
        </div>
        <SelectDot checked={checked} onChange={onToggle} label={`Select ${pick.name}`} style={{ marginRight: -8, marginTop: -8 }} />
      </div>
      <button type="button" onClick={onOpen} aria-label={`Open ${pick.name}`} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere', minWidth: 0 }}>{pick.name}</div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {pick.price && <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{pick.price}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(pick.cal)} kcal</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4, overflowWrap: 'anywhere' }}>{pick.items}</div>
        {hasModification(pick.modifications) && (
          <div style={{ fontSize: 12, color: 'var(--accent-secondary)', fontWeight: 700, marginTop: 4 }}>Modified: {pick.modifications}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, marginTop: 12, padding: '10px 6px', borderRadius: 16, background: 'var(--chip-bg)' }}>
          <Stat label="Calories" value={Math.round(pick.cal)} />
          <Stat label="Protein" value={Math.round(pick.protein)} unit="g" color="var(--macro-protein)" />
          <Stat label="Carbs" value={Math.round(pick.carbs)} unit="g" color="var(--macro-carbs)" />
          <Stat label="Fats" value={Math.round(pick.fat)} unit="g" color="var(--macro-fat)" />
        </div>
      </button>
      {pick.tip && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, var(--macro-carbs) 14%, var(--bg-card))', fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
          <i className="ti ti-bulb" aria-hidden="true" style={{ fontSize: 16, color: 'var(--macro-carbs)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ overflowWrap: 'anywhere' }}><strong style={{ color: 'var(--text-primary)' }}>Smart hack:</strong> {pick.tip}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <PrimaryButton onClick={onLog} disabled={busy} aria-label={`Log ${pick.name} to ${mealLabel}`} style={{ flex: 1, minHeight: 46, borderRadius: 14, fontSize: 14 }}>
          <i className="ti ti-circle-plus" aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Log to {mealLabel}</span>
        </PrimaryButton>
        <GhostButton onClick={onOpen} aria-label={`Customize ${pick.name}`} style={{ border: '1px solid var(--border-strong)', borderRadius: 14, minHeight: 46 }}>
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" style={{ fontSize: 16 }} /> Customize
        </GhostButton>
      </div>
    </ScanCard>
  );
}

function DishRow({ item, checked, onToggle, onOpen, first }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderTop: first ? 'none' : '1px solid var(--border-default)' }}>
      <SelectDot checked={checked} onChange={onToggle} label={`Select ${item.name}`} style={{ marginLeft: -8 }} />
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, color: 'inherit' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.name}</div>
          {item.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{item.description}</div>}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {item.price && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{item.price}</div>}
          <div style={{ color: 'var(--accent-secondary)', fontWeight: 800, fontSize: 13 }}>{item.cal} kcal</div>
          <div>{item.protein}p · {item.carbs}c · {item.fat}f</div>
        </div>
      </button>
    </div>
  );
}

// The scanned menu as a ranked, filterable list. Presentation only —
// MenuScanModal owns the scan, selection state and logging.
export function MenuList({
  preview, restaurant, advice, recommendations, menuItems, groupedItems, filter, setFilter,
  isSelected, onToggle, onOpen, onLogOne, mealLabel, dailyTarget, consumed,
  onRescan, onSearchManually, onClose, closing, adding, addError, selectedList, selectedCal, onLogSelected, onClearSelected,
}) {
  const counts = {
    all: menuItems.length || recommendations.length,
    goal: recommendations.length,
    protein: menuItems.filter(isHighProtein).length,
    carb: menuItems.filter(isLowCarb).length,
  };
  const chips = FILTERS.filter(f => f.id === 'all' || counts[f.id] > 0);
  const active = chips.some(f => f.id === filter) ? filter : 'all';
  const top = recommendations[0];
  const adviceText = advice || menuAdvice(top, dailyTarget, consumed);
  const hasTarget = dailyTarget.calories > 0;
  const topOver = top && hasTarget && top.cal > Math.max(0, dailyTarget.calories - consumed.cal);

  const filtered = active === 'protein' ? menuItems.filter(isHighProtein) : active === 'carb' ? menuItems.filter(isLowCarb) : null;
  const showRanked = active === 'all' || active === 'goal';
  const showFull = active === 'all';

  const title = (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Menu scan &amp; match</div>
      {restaurant && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <i className="ti ti-tools-kitchen-2" aria-hidden="true" /> {restaurant}
        </div>
      )}
    </div>
  );

  const footer = selectedList.length > 0 ? (
    <div>
      {addError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{addError}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-secondary)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Selected: {selectedList.length === 1 ? selectedList[0][1].data.name : `${selectedList.length} dishes`} ({Math.round(selectedCal)} kcal)
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <GhostButton onClick={onClearSelected} style={{ border: '1px solid var(--border-strong)', borderRadius: 18, minHeight: 54 }}>Clear</GhostButton>
        <PrimaryButton onClick={onLogSelected} disabled={adding} style={{ flex: 1 }}>
          <i className="ti ti-tools-kitchen-2" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {adding ? 'Adding…' : `Log ${selectedList.length} item${selectedList.length === 1 ? '' : 's'} to ${mealLabel} (${Math.round(selectedCal)} kcal)`}
          </span>
        </PrimaryButton>
      </div>
    </div>
  ) : null;

  return (
    <ScanPage title={title} onBack={onClose} closing={closing} footer={footer} testId="menu-result">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '2px 2px 12px' }}>
        <Chip color="var(--accent-secondary)" icon="ti-sparkles">AI match on</Chip>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{counts.all} dishes detected</span>
      </div>

      <PillRow label="Filter dishes" style={{ marginBottom: 12 }}>
        {chips.map(f => (
          <PillButton key={f.id} active={active === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <span style={{ opacity: 0.75, marginLeft: 4 }}>{counts[f.id]}</span>
          </PillButton>
        ))}
      </PillRow>

      {preview && (
        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', marginBottom: 12, background: 'var(--bg-subtle)' }}>
          <img src={preview} alt="Your menu" style={{ display: 'block', width: '100%', height: 150, objectFit: 'cover' }} />
          <button type="button" onClick={onRescan} aria-label="Re-scan"
            style={{ position: 'absolute', left: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 99, border: 'none', background: 'rgba(20,14,10,0.72)', color: '#f6f2fa', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-camera" aria-hidden="true" style={{ fontSize: 15 }} /> Re-scan
          </button>
        </div>
      )}

      {showRanked && adviceText && (
        <InsightCard icon="ti-map-pin" title="Smart dining advice">
          <div>{adviceText}</div>
          {hasTarget && top && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: topOver ? 'var(--text-secondary)' : 'var(--accent-secondary)' }}>
                <i className={`ti ${topOver ? 'ti-alert-circle' : 'ti-shield-check'}`} aria-hidden="true" /> {topOver ? 'Over today\'s budget' : 'Daily budget safe'}
              </span>
              <span>Target: {Math.round(dailyTarget.calories).toLocaleString()} kcal max</span>
            </div>
          )}
        </InsightCard>
      )}

      {showRanked && recommendations.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '16px 4px 10px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>Curated &amp; ranked</div>
            <Eyebrow style={{ fontSize: 9, color: 'var(--accent-secondary)', textAlign: 'right' }}>Sorted by goal fit</Eyebrow>
          </div>
          {recommendations.map((pick, i) => (
            <RankedCard
              key={i} pick={pick} rank={i} mealLabel={mealLabel} busy={adding}
              checked={isSelected('recommendation', i)}
              onToggle={() => onToggle('recommendation', pick, i)}
              onOpen={() => onOpen('recommendation', pick, i)}
              onLog={() => onLogOne('recommendation', pick, i)}
            />
          ))}
        </>
      )}
      {showRanked && recommendations.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Couldn't put together recommendations for this menu.</p>
      )}

      {showFull && (
        groupedItems.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Couldn't make out individual items on this menu.</p>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '16px 4px 10px' }}>Full menu</div>
            {groupedItems.map(({ section, items }) => (
              <ScanCard key={section} style={{ padding: '12px 14px 4px' }}>
                <Eyebrow style={{ color: 'var(--accent-secondary)', marginBottom: 2 }}>{section}</Eyebrow>
                {items.map((item, i) => {
                  const idx = menuItems.indexOf(item);
                  return <DishRow key={i} item={item} first={i === 0} checked={isSelected('item', idx)} onToggle={() => onToggle('item', item, idx)} onOpen={() => onOpen('item', item, idx)} />;
                })}
              </ScanCard>
            ))}
          </>
        )
      )}

      {filtered && (
        filtered.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No dishes match this filter.</p>
        ) : (
          <ScanCard style={{ padding: '4px 14px' }}>
            {[...filtered].sort((a, b) => (active === 'protein' ? b.protein - a.protein : a.carbs - b.carbs)).map((item, i) => {
              const idx = menuItems.indexOf(item);
              return <DishRow key={idx} item={item} first={i === 0} checked={isSelected('item', idx)} onToggle={() => onToggle('item', item, idx)} onOpen={() => onOpen('item', item, idx)} />;
            })}
          </ScanCard>
        )
      )}

      {onSearchManually && (
        <button type="button" onClick={onSearchManually}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: 14, marginTop: 4, marginBottom: 12, borderRadius: 'var(--card-radius)', border: '1px dashed var(--border-strong)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
          <IconTile icon="ti-camera-plus" size={40} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Item not detected?</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>Search for the dish yourself and add it to your log.</span>
          </span>
          <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
        </button>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 4px 8px', lineHeight: 1.5 }}>
        Tick the dishes you had. These are AI estimates.
      </p>
    </ScanPage>
  );
}

// The customize / confirm page for one picked dish.
export function MenuReview({
  picked, adjusted, sourceLabel, detail, detailLoading, portions, portionIdx, setPortionIdx,
  tweaks, activeTweaks, onToggleTweak, onInspect,
  dailyTarget, consumed, comment, setComment, voice, correcting, correctionError, onCorrect,
  onBack, onLog, adding, closing, error,
}) {
  const data = picked.data;
  const isRec = picked.kind === 'recommendation';
  return (
    <ScanPage
      title="Customize your pick" onBack={onBack} backLabel={isRec ? 'Back to options' : 'Back to menu'} closing={closing} testId="menu-review"
      footer={(
        <PrimaryButton onClick={onLog} disabled={adding}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adding ? 'Adding…' : 'Confirm & log'}</span>
          {!adding && (
            <span style={{ flexShrink: 0, background: 'rgba(255,255,255,0.18)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>+{adjusted.cal} kcal</span>
          )}
        </PrimaryButton>
      )}
    >
      <SourcePill label={sourceLabel} quote={detail?.source?.quote} onInspect={detail?.source?.box ? onInspect : undefined} />
      <ScanCard>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{data.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4, marginBottom: 10, overflowWrap: 'anywhere' }}>
          {isRec ? data.items : (data.description || data.section)}
        </div>
        {isRec && hasModification(data.modifications) && (
          <div style={{ fontSize: 12, color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: 10 }}>Modified: {data.modifications}</div>
        )}
        {portions.length > 1 ? (
          <PortionRow portions={portions} value={portionIdx} onChange={setPortionIdx} />
        ) : detailLoading ? <PortionSkeleton /> : null}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05, color: 'var(--text-primary)' }}>{adjusted.cal}</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>kcal</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MacroTile kind="protein" label="Protein" value={adjusted.protein} />
          <MacroTile kind="carbs" label="Carbs" value={adjusted.carbs} />
          <MacroTile kind="fat" label="Fat" value={adjusted.fat} />
        </div>
        {detail && (
          <IncludesRow allergens={detail.allergens} sodiumMg={adjusted.sodium} sodium={adjusted.sodium} fibre={adjusted.fibre} sugar={adjusted.sugar} />
        )}
      </ScanCard>

      {dailyTarget.calories > 0 && (
        <ScanCard>
          <DayBudgetImpact target={dailyTarget.calories} consumed={consumed.cal} adding={adjusted.cal} />
        </ScanCard>
      )}

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <label htmlFor="menu-correction" style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Get something different, or want to note a change? Tell it here</label>
          <VoiceMicButton recording={voice.recording} transcribing={voice.transcribing} onStart={voice.start} onStop={voice.stop} title="Speak your correction" />
        </div>
        <textarea id="menu-correction" value={comment} onChange={e => setComment(e.target.value)} disabled={correcting} rows={3}
          placeholder="e.g. I got the large size, or no cheese, or extra sauce on the side"
          style={{ ...fieldStyle, resize: 'vertical', marginBottom: 8 }} />
        {voice.error && <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--danger)' }}>{voice.error}</div>}
        {tweaks.length > 0 && <QuickTweaks tweaks={tweaks} active={activeTweaks} onToggle={onToggleTweak} />}
        <GhostButton onClick={onCorrect} disabled={!comment.trim() || correcting}
          style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 14, opacity: !comment.trim() || correcting ? 0.55 : 1, cursor: !comment.trim() || correcting ? 'not-allowed' : 'pointer' }}>
          <i className="ti ti-refresh" aria-hidden="true" style={{ fontSize: 16 }} /> {correcting ? 'Fixing…' : 'Recalculate'}
        </GhostButton>
        {correctionError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{correctionError}</div>}
      </ScanCard>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 4px 8px', lineHeight: 1.5 }}>
        This is an AI estimate based on the menu photo, not verified nutrition data — review before adding.
      </p>
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: '0 4px 12px' }}>{error}</div>}
    </ScanPage>
  );
}
