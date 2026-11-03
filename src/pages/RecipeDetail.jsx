import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSavedMeals } from '../hooks/useSavedMeals';
import { useRecipeLogging, RECIPE_MEALS } from '../hooks/useRecipeLogging';
import { useRecipePhotoUrls } from '../hooks/useRecipePhotoUrls';
import { uploadRecipePhoto, removeRecipePhoto } from '../lib/recipePhoto';
import { allTags, perServing, prepLabel } from '../lib/recipeTags';
import { energySplit } from '../lib/scanInsights';
import { sumFoodItems, scaleFood, formatAmountUnit } from '../lib/foodMath';
import { currentTimeHHMM, formatTime12h } from '../lib/mealTime';
import { showAppToast } from '../lib/appToast';
import RecipeEditor from '../components/RecipeEditor';
import ServingStepper from '../components/ServingStepper';
import { HeartButton } from '../components/recipes/RecipeCard';
import {
  ScanPage, ScanCard, Eyebrow, Chip, SplitBar, MacroTile, PillButton, PillRow, PrimaryButton, IconTile,
} from '../components/scan/ScanKit';

const MEAL_ICONS = { Breakfast: 'ti-sunrise', Lunch: 'ti-sun', Dinner: 'ti-moon', Snacks: 'ti-cookie' };

// One recipe as its own page: photo, tags and prep time, the numbers, how many
// servings and where to log them, the ingredients, and edit / share / delete.
export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const savedMeals = useSavedMeals();
  const { log, logByTime, defaultMeal } = useRecipeLogging();
  const recipe = savedMeals.rows.find((r) => r.id === id) || null;
  const photoUrl = useRecipePhotoUrls([recipe?.photo_path])[recipe?.photo_path] || null;
  const extras = savedMeals.extrasSupported;

  const [servings, setServings] = useState('1');
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(() => currentTimeHHMM());
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { if (!menuOpen) return undefined; const close = () => setMenuOpen(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, [menuOpen]);

  const per = useMemo(() => (recipe ? perServing(recipe) : null), [recipe]);
  const total = useMemo(() => (recipe ? sumFoodItems(recipe.items || []) : null), [recipe]);
  const n = Number(servings) || 0;
  const scaled = per && n > 0 ? scaleFood(per, n) : null;
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/recipes', { replace: true }));

  async function handleLog() {
    if (!n || logging) return;
    setLogging(true);
    setError(null);
    try {
      showAppToast(await log(recipe, n, meal, time));
      goBack();
    } catch (err) {
      console.error('Failed to log recipe:', err);
      setError(`Couldn't add ${recipe.name} — try again.`);
    } finally {
      setLogging(false);
    }
  }

  async function handleSaveEdit(changes) {
    const { photoFile, removePhoto, ...rest } = changes;
    let photoPath;                                       // undefined = leave the photo as it is
    if (photoFile) photoPath = await uploadRecipePhoto(user.id, photoFile);
    else if (removePhoto) photoPath = null;
    const old = recipe.photo_path;
    try {
      await savedMeals.update(recipe.id, { ...rest, ...(photoPath !== undefined ? { photoPath } : {}) });
    } catch (err) {
      if (photoFile && photoPath) removeRecipePhoto(photoPath);   // don't leave the new file behind
      throw err;
    }
    if (photoPath !== undefined && old) removeRecipePhoto(old);
    setEditing(false);
    showAppToast(`${changes.name} updated`);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${recipe.name}"? This can't be undone.`)) return;
    try {
      const old = recipe.photo_path;
      await savedMeals.remove(recipe.id);
      if (old) removeRecipePhoto(old);
      showAppToast(`${recipe.name} deleted`);
      navigate('/recipes', { replace: true });
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      showAppToast(`Couldn't delete ${recipe.name} — try again`, true);
    }
  }

  async function handleShare() {
    const next = !recipe.shared_with_friends;
    try {
      await savedMeals.setShared(recipe.id, next);
      showAppToast(next ? `${recipe.name} is now shared with your friends` : `${recipe.name} is no longer shared`);
    } catch (err) {
      console.error('Failed to change sharing:', err);
      showAppToast("Couldn't change sharing. Try again.", true);
    }
  }

  async function handleHeart() {
    try { await savedMeals.setFavourite(recipe.id, !recipe.favourite); } catch { showAppToast("Couldn't change that. Try again.", true); }
  }

  if (savedMeals.loading) return null;
  if (!recipe) {
    return (
      <ScanPage title="Recipe" onBack={goBack} testId="recipe-detail">
        <ScanCard style={{ textAlign: 'center', padding: 32 }}>
          <i className="ti ti-tools-kitchen-2" aria-hidden="true" style={{ fontSize: 28, color: 'var(--text-hint)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '12px 0 0' }}>We couldn't find that recipe. It may have been deleted.</p>
        </ScanCard>
      </ScanPage>
    );
  }

  if (editing) {
    return (
      <RecipeEditor
        recipe={recipe}
        extras={extras ? { allTags: allTags(savedMeals.rows), photoUrl } : null}
        onCancel={() => setEditing(false)}
        onAddIngredient={(draft) => navigate('/food', { state: { editMealBuilder: recipe.id, editDraft: draft } })}
        onSave={handleSaveEdit}
      >
        {({ body, footer }) => <ScanPage title="Edit recipe" onBack={() => setEditing(false)} backLabel="Cancel editing" footer={footer} testId="recipe-edit">{body}</ScanPage>}
      </RecipeEditor>
    );
  }

  const items = recipe.items || [];
  const prep = prepLabel(recipe.prep_minutes);
  const tags = recipe.tags || [];
  const count = Number(recipe.servings) || 1;
  const logLabel = logByTime ? `Log at ${formatTime12h(time)}` : `Log to ${meal}`;

  return (
    <ScanPage
      title="Recipe details" onBack={goBack} testId="recipe-detail"
      headerRight={(
        <div style={{ position: 'relative' }}>
          <button type="button" aria-label="More" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <i className="ti ti-dots-vertical" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', right: 0, top: 50, minWidth: 170, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', padding: 6, zIndex: 5 }}>
              <button role="menuitem" type="button" onClick={handleDelete} style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: 'none', border: 'none', borderRadius: 12, color: 'var(--danger)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <i className="ti ti-trash" aria-hidden="true" /> Delete recipe
              </button>
            </div>
          )}
        </div>
      )}
      footer={(
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <PrimaryButton onClick={handleLog} disabled={logging || !n}>
            <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {logging ? 'Adding…' : `${logLabel} • ${Math.round(scaled?.cal || 0)} kcal`}
            </span>
          </PrimaryButton>
        </>
      )}
    >
      {photoUrl && (
        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', marginBottom: 14, background: 'var(--bg-subtle)' }}>
          <img src={photoUrl} alt={recipe.name} style={{ display: 'block', width: '100%', maxHeight: 260, aspectRatio: '4 / 3', objectFit: 'cover' }} />
          {extras && <HeartButton on={recipe.favourite} onClick={handleHeart} name={recipe.name} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(20,14,10,0.62)', color: recipe.favourite ? 'var(--accent-secondary)' : '#f6f2fa' }} />}
        </div>
      )}

      <div style={{ margin: '2px 4px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((t) => <Chip key={t} color="var(--accent-secondary)">{t}</Chip>)}
            {prep && <Chip icon="ti-clock">{prep}</Chip>}
          </div>
          {!photoUrl && extras && <HeartButton on={recipe.favourite} onClick={handleHeart} name={recipe.name} />}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: '8px 0 4px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{recipe.name}</h1>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--accent-secondary)', fontSize: 20 }}>{Math.round(per.cal)}</strong> kcal · {count} serving{count === 1 ? '' : 's'}
        </div>
      </div>

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Macros</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>per serving — {Math.round(total.cal)} kcal total</span>
        </div>
        <SplitBar split={energySplit(per)} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 8, marginTop: 14 }}>
          <MacroTile kind="cal" label="kcal" value={Math.round(per.cal)} unit="" />
          <MacroTile kind="protein" label="Protein" value={per.protein} />
          <MacroTile kind="carbs" label="Carbs" value={per.carbs} />
          <MacroTile kind="fat" label="Fat" value={per.fat} />
        </div>
      </ScanCard>

      <ScanCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ServingStepper amount={servings} setAmount={setServings} step={0.5} min={0.5} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>serving{n === 1 ? '' : 's'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>~ <strong style={{ color: 'var(--text-primary)' }}>{Math.round(scaled?.cal || 0)}</strong> kcal</span>
        </div>
      </ScanCard>

      <ScanCard>
        <Eyebrow style={{ marginBottom: 10 }}>{logByTime ? 'Log at' : 'Log destination'}</Eyebrow>
        {logByTime ? (
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, background: 'var(--chip-bg)', border: '1px solid transparent', borderRadius: 14, padding: '0 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }} />
        ) : (
          <PillRow label="Meal" wrap>
            {RECIPE_MEALS.map((m) => (
              <PillButton key={m} active={meal === m} onClick={() => setMeal(m)}>
                <i className={`ti ${MEAL_ICONS[m]}`} aria-hidden="true" style={{ marginRight: 6 }} />{m}
              </PillButton>
            ))}
          </PillRow>
        )}
      </ScanCard>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 4px 10px', fontSize: 18, fontWeight: 800 }}>
        Ingredients <Chip>{items.length}</Chip>
      </div>
      {items.map((it, i) => (
        <ScanCard key={i} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconTile icon="ti-tools-kitchen-2" size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {it.loggedAmount != null && it.loggedUnit ? `${formatAmountUnit(it.loggedAmount, it.loggedUnit)} ` : ''}{it.name}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{Math.round(it.cal)}<span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>kcal</span></div>
        </ScanCard>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <ActionRow icon="ti-edit" onClick={() => setEditing(true)}>Edit recipe</ActionRow>
        <ActionRow icon={recipe.shared_with_friends ? 'ti-users-group' : 'ti-share-3'} onClick={handleShare} on={recipe.shared_with_friends}>
          {recipe.shared_with_friends ? 'Shared with friends' : 'Share with friends'}
        </ActionRow>
      </div>
    </ScanPage>
  );
}

function ActionRow({ icon, onClick, children, on }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on === undefined ? undefined : !!on}
      style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: on ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--card-border)'}`, borderRadius: 16, color: on ? 'var(--accent-secondary)' : 'var(--text-primary)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
      <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 17 }} /> {children}
    </button>
  );
}
