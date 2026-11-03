import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSavedMeals } from '../../hooks/useSavedMeals';
import { useRecipePhotoUrls } from '../../hooks/useRecipePhotoUrls';
import { getAllFriendRecipes } from '../../lib/friends';
import { prepLabel } from '../../lib/recipeTags';
import { MacroLine } from '../recipes/RecipeCard';
import { Chip, IconTile, ScanCard, PillButton, PillRow } from '../scan/ScanKit';

// Everything your friends have chosen to share, in one list, with who shared it
// and a one-tap copy into your own recipes (the photo stays theirs).
export default function FriendRecipes({ friends, onToast }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const savedMeals = useSavedMeals();
  const [recipes, setRecipes] = useState(null); // null while loading
  const [who, setWho] = useState('all');
  const [savingId, setSavingId] = useState(null);
  const [savedIds, setSavedIds] = useState(() => new Set());

  const friendKey = friends.map((f) => f.id).join('|');
  useEffect(() => {
    let cancelled = false;
    if (!user || friends.length === 0) { setRecipes([]); return undefined; }
    getAllFriendRecipes(friends).then((r) => { if (!cancelled) setRecipes(r); });
    return () => { cancelled = true; };
    // friends is summarised by friendKey so a refetch that changes nothing doesn't reload the photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, friendKey]);

  const photoUrls = useRecipePhotoUrls((recipes || []).map((r) => r.photoPath));
  const shown = useMemo(() => (recipes || []).filter((r) => who === 'all' || r.friendId === who), [recipes, who]);
  const sharers = useMemo(() => friends.filter((f) => (recipes || []).some((r) => r.friendId === f.id)), [friends, recipes]);

  async function save(recipe) {
    setSavingId(recipe.id);
    try {
      await savedMeals.create(recipe.name, recipe.items, recipe.servings, { tags: recipe.tags, prepMinutes: recipe.prepMinutes });
      setSavedIds((s) => new Set(s).add(recipe.id));
      onToast(`${recipe.name} saved to your recipes`);
    } catch (err) {
      console.error('Failed to save recipe:', err);
      onToast('Couldn\'t save that recipe. Try again.', true);
    } finally {
      setSavingId(null);
    }
  }

  if (recipes == null) return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>;
  if (recipes.length === 0) {
    return (
      <ScanCard style={{ padding: '22px 18px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>No shared recipes yet</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '6px 0 0' }}>
          {friends.length === 0 ? 'Add a friend and the recipes they share will show up here.' : 'When a friend shares one of their recipes, it will show up here.'}
        </p>
      </ScanCard>
    );
  }

  return (
    <>
      {sharers.length > 1 && (
        <PillRow label="Show recipes from" style={{ marginBottom: 12 }}>
          <PillButton active={who === 'all'} onClick={() => setWho('all')}>Everyone</PillButton>
          {sharers.map((f) => <PillButton key={f.id} active={who === f.id} onClick={() => setWho(f.id)}>{String(f.name).split(/\s+/)[0]}</PillButton>)}
        </PillRow>
      )}
      {shown.map((r) => {
        const photo = r.photoPath ? photoUrls[r.photoPath] : null;
        const prep = prepLabel(r.prepMinutes);
        const done = savedIds.has(r.id);
        const asRecipe = { items: r.items, servings: r.servings };
        return (
          <ScanCard key={r.id} data-testid="friend-recipe" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {photo
                ? <img src={photo} alt="" style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 16, objectFit: 'cover', background: 'var(--bg-subtle)' }} />
                : <IconTile icon="ti-tools-kitchen-2" size={64} style={{ borderRadius: 18 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                {(r.tags.length > 0 || prep) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                    {r.tags.slice(0, 2).map((t) => <Chip key={t} color="var(--accent-secondary)">{t}</Chip>)}
                    {r.tags.length > 2 && <Chip>+{r.tags.length - 2}</Chip>}
                    {prep && <Chip icon="ti-clock">{prep}</Chip>}
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{r.name}</div>
                <MacroLine recipe={asRecipe} style={{ marginTop: 4 }} />
                <button
                  type="button" onClick={() => navigate(`/friends/${r.friendId}`)}
                  style={{ background: 'none', border: 'none', padding: '6px 0', minHeight: 28, marginTop: 0, fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left' }}
                >
                  From {r.friendName}
                </button>
              </div>
            </div>
            <button
              type="button" onClick={() => save(r)} disabled={savingId === r.id || done}
              style={{ marginTop: 12, width: '100%', minHeight: 44, background: done ? 'var(--chip-bg)' : 'var(--accent)', color: done ? 'var(--text-secondary)' : 'var(--accent-contrast)', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: done ? 'default' : 'pointer', opacity: savingId === r.id ? 0.6 : 1 }}
            >
              {done ? 'Saved to your recipes' : savingId === r.id ? 'Saving…' : 'Save to my recipes'}
            </button>
          </ScanCard>
        );
      })}
    </>
  );
}
