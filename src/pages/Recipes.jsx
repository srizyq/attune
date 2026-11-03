import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useSavedMeals } from '../hooks/useSavedMeals';
import { useRecipeLogging } from '../hooks/useRecipeLogging';
import { useRecipePhotoUrls } from '../hooks/useRecipePhotoUrls';
import { allTags, filterRecipes, sortRecipes, visibleBuiltIns, featuredRecipe, SORTS } from '../lib/recipeTags';
import AppNav from '../components/AppNav';
import Toast from '../components/Toast';
import PageHeader from '../components/PageHeader';
import RecipeCard, { FeaturedRecipe } from '../components/recipes/RecipeCard';
import { ScanCard, Eyebrow, PillButton, PillRow, Chip } from '../components/scan/ScanKit';

export default function Recipes() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const savedMeals = useSavedMeals();
  const { log } = useRecipeLogging();
  const extras = savedMeals.extrasSupported;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortId, setSortId] = useState('recent');
  const [loggingId, setLoggingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const showToast = (message, isError = false) => { setToast(message); setToastError(isError); };

  const rows = savedMeals.rows;
  const photoUrls = useRecipePhotoUrls(rows.map((r) => r.photo_path));
  const tags = useMemo(() => (extras ? allTags(rows) : []), [rows, extras]);
  const builtIns = useMemo(() => visibleBuiltIns(extras ? rows : rows.map((r) => ({ ...r, favourite: false, prep_minutes: null }))), [rows, extras]);
  // A filter whose recipes are all gone (a deleted tag, an un-hearted last favourite) falls back to All.
  const activeFilter = filter === 'all' || builtIns.some((f) => f.id === filter) || tags.some((t) => t.toLowerCase() === filter.toLowerCase()) ? filter : 'all';

  const shown = useMemo(() => sortRecipes(filterRecipes(rows, { query, filter: activeFilter }), sortId), [rows, query, activeFilter, sortId]);
  const featured = useMemo(() => (extras && !query.trim() && activeFilter === 'all' ? featuredRecipe(rows, savedMeals.recentLogs) : null), [rows, savedMeals.recentLogs, query, activeFilter, extras]);
  const listed = featured ? shown.filter((r) => r.id !== featured.id) : shown;

  async function quickLog(recipe) {
    if (loggingId) return;
    setLoggingId(recipe.id);
    try {
      showToast(await log(recipe, 1));
    } catch (err) {
      console.error('Failed to log recipe:', err);
      showToast(`Couldn't add ${recipe.name} — try again`, true);
    } finally {
      setLoggingId(null);
    }
  }

  async function toggleFavourite(recipe) {
    try {
      await savedMeals.setFavourite(recipe.id, !recipe.favourite);
    } catch (err) {
      console.error('Failed to change favourite:', err);
      showToast('Couldn\'t change that. Try again.', true);
    }
  }

  const open = (recipe) => navigate(`/recipes/${recipe.id}`);
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'));
  const newRecipe = () => navigate('/food', { state: { openMealBuilder: true } });
  const sortLabel = SORTS.find((s) => s.id === sortId)?.label || 'Recent';

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="food" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader
          title="Recipes"
          onBack={goBack}
          backLabel="Back"
          right={(
            <button
              onClick={newRecipe}
              style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, background: 'var(--accent)', border: 'none', borderRadius: 99, padding: '0 16px', fontSize: 13, fontWeight: 800, color: 'var(--accent-contrast)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <i className="ti ti-plus" aria-hidden="true" /> New recipe
            </button>
          )}
        />

        <div className="page-pad" style={{ maxWidth: 700 }}>
          {rows.length > 0 && (
            <>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-hint)', fontSize: 17 }} />
                <input
                  value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recipes…" aria-label="Search recipes"
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '0 16px 0 42px', background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 2px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Eyebrow>Saved recipes</Eyebrow>
                  <Chip>{rows.length}</Chip>
                </div>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'var(--chip-bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, minHeight: 32, boxSizing: 'border-box' }}>
                  <i className="ti ti-arrows-sort" aria-hidden="true" style={{ fontSize: 14 }} />
                  <span>Sort: {sortLabel}</span>
                  <select value={sortId} onChange={(e) => setSortId(e.target.value)} aria-label="Sort recipes" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', fontSize: 16 }}>
                    {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              </div>

              <PillRow label="Filter recipes" style={{ marginBottom: 14 }}>
                <PillButton active={activeFilter === 'all'} onClick={() => setFilter('all')}>All ({rows.length})</PillButton>
                {builtIns.map((f) => <PillButton key={f.id} active={activeFilter === f.id} onClick={() => setFilter(f.id)}>{f.label}</PillButton>)}
                {tags.map((t) => <PillButton key={t} active={activeFilter.toLowerCase() === t.toLowerCase()} onClick={() => setFilter(t)}>{t}</PillButton>)}
              </PillRow>
            </>
          )}

          {savedMeals.loading ? null : rows.length === 0 ? (
            <ScanCard style={{ textAlign: 'center', padding: 32 }}>
              <i className="ti ti-tools-kitchen-2" aria-hidden="true" style={{ fontSize: 28, color: 'var(--text-hint)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
                No recipes yet. Build one from foods you cook often and log it in one tap.
              </p>
            </ScanCard>
          ) : shown.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              {query.trim() ? `No recipes match "${query.trim()}"` : 'No recipes in this group yet.'}
            </p>
          ) : (
            <>
              {featured && (
                <FeaturedRecipe
                  recipe={featured} photoUrl={photoUrls[featured.photo_path]} showFavourite={extras}
                  onOpen={() => open(featured)} onToggleFavourite={() => toggleFavourite(featured)}
                />
              )}
              {listed.map((recipe) => (
                <RecipeCard
                  key={recipe.id} recipe={recipe} photoUrl={photoUrls[recipe.photo_path]} showFavourite={extras}
                  logging={loggingId === recipe.id}
                  onOpen={() => open(recipe)} onLog={() => quickLog(recipe)} onToggleFavourite={() => toggleFavourite(recipe)}
                />
              ))}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 8px' }}>
                <button onClick={newRecipe} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 22px', borderRadius: 99, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <i className="ti ti-circle-plus" aria-hidden="true" style={{ color: 'var(--accent-secondary)', fontSize: 18 }} /> New recipe
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} error={toastError} onDone={() => setToast(null)} />}
    </div>
  );
}
