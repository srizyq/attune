import { perServing, prepLabel } from '../../lib/recipeTags';
import { Chip, IconTile } from '../scan/ScanKit';

// The numbers line shared by the list cards: calories, then protein / carbs / fat
// in the app's macro colours.
export function MacroLine({ recipe, style, onDark = false }) {
  const p = perServing(recipe);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', fontSize: 12, fontWeight: 700, ...style }}>
      <span style={{ color: onDark ? '#f6f2fa' : 'var(--text-primary)' }}>{Math.round(p.cal)} kcal</span>
      <span style={{ color: 'var(--macro-protein)' }}>{p.protein}g P</span>
      <span style={{ color: 'var(--macro-carbs)' }}>{p.carbs}g C</span>
      <span style={{ color: 'var(--macro-fat)' }}>{p.fat}g F</span>
    </div>
  );
}

// Heart: favourite a recipe. Its own button with a proper tap area.
export function HeartButton({ on, onClick, name, style }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={!!on} aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: 'var(--chip-bg)', color: on ? 'var(--accent-secondary)' : 'var(--text-muted)', ...style }}
    >
      <i className={on ? 'ti ti-heart-filled' : 'ti ti-heart'} aria-hidden="true" />
    </button>
  );
}

// One recipe in the list: a photo (or an icon tile when it has none), its tags and
// prep time, the name, the numbers per serving, a heart, and a quick "Log" that adds
// one serving. Tapping anywhere else opens the recipe.
export default function RecipeCard({ recipe, photoUrl, onOpen, onLog, onToggleFavourite, showFavourite, logging }) {
  const tags = recipe.tags || [];
  const prep = prepLabel(recipe.prep_minutes);
  const count = (recipe.items || []).length;
  return (
    <article style={{ display: 'flex', alignItems: 'stretch', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)', padding: 12, marginBottom: 10, minWidth: 0 }}>
      <button
        type="button" onClick={onOpen} aria-label={`Open ${recipe.name}`}
        style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
      >
        {photoUrl
          ? <img src={photoUrl} alt="" style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 16, objectFit: 'cover', background: 'var(--bg-subtle)' }} />
          : <IconTile icon="ti-tools-kitchen-2" size={64} style={{ borderRadius: 18 }} />}
        <span style={{ minWidth: 0, flex: 1 }}>
          {(tags.length > 0 || prep) && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
              {tags.slice(0, 2).map((t) => <Chip key={t} color="var(--accent-secondary)">{t}</Chip>)}
              {tags.length > 2 && <Chip>+{tags.length - 2}</Chip>}
              {prep && <Chip icon="ti-clock">{prep}</Chip>}
            </span>
          )}
          <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{recipe.name}</span>
          <MacroLine recipe={recipe} style={{ marginTop: 4 }} />
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {count} ingredient{count === 1 ? '' : 's'} · {Number(recipe.servings) || 1} serving{(Number(recipe.servings) || 1) === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, flexShrink: 0 }}>
        {showFavourite
          ? <HeartButton on={recipe.favourite} onClick={onToggleFavourite} name={recipe.name} />
          : <span style={{ height: 40 }} />}
        <button
          type="button" onClick={onLog} disabled={logging} aria-label={`Log ${recipe.name}`}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 99, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: logging ? 'not-allowed' : 'pointer', opacity: logging ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <i className="ti ti-plus" aria-hidden="true" style={{ fontSize: 14 }} /> Log
        </button>
      </div>
    </article>
  );
}

// The big card at the top: the recipe you logged most recently. With a photo it
// fills the card; without one it is a soft panel with the same details.
export function FeaturedRecipe({ recipe, photoUrl, onOpen, onToggleFavourite, showFavourite }) {
  const prep = prepLabel(recipe.prep_minutes);
  const tag = (recipe.tags || [])[0];
  const light = !!photoUrl;
  return (
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', marginBottom: 14, minHeight: 190, background: 'var(--accent-bg)', border: '1px solid var(--card-border)' }}>
      {photoUrl && <img src={photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {photoUrl && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,10,8,0.88) 8%, rgba(14,10,8,0.15) 62%)' }} />}
      <button type="button" onClick={onOpen} aria-label={`Open featured recipe ${recipe.name}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', minHeight: 190, boxSizing: 'border-box', padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: light ? '#f6f2fa' : 'var(--text-primary)' }}>
        <span style={{ alignSelf: 'flex-start', marginBottom: 8 }}><Chip color="var(--accent-secondary)" icon="ti-sparkles">Featured · last logged</Chip></span>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginBottom: 2 }}>{[tag, prep].filter(Boolean).join(' · ')}</span>
        <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere', paddingRight: showFavourite ? 48 : 0 }}>{recipe.name}</span>
        <MacroLine recipe={recipe} onDark={light} style={{ marginTop: 8 }} />
      </button>
      {showFavourite && <HeartButton on={recipe.favourite} onClick={onToggleFavourite} name={recipe.name} style={{ position: 'absolute', top: 12, right: 12, ...(photoUrl ? { background: 'rgba(20,14,10,0.62)', color: recipe.favourite ? 'var(--accent-secondary)' : '#f6f2fa' } : {}) }} />}
    </div>
  );
}
