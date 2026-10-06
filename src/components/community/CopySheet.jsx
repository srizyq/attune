import { useState } from 'react';
import DragSheet from '../DragSheet';
import { useAuth } from '../../hooks/useAuth';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { addSavedMeal, insertFoodLogRows } from '../../lib/db';
import { recordCopy, friendlyCommunityError } from '../../lib/community';
import { postToLogRows, recipePostToSavedMeal, mealLabel } from '../../lib/communityPosts';
import { mealFromDate } from '../../lib/mealTime';
import { todayLocalDate } from '../../lib/patterns';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const chip = (on) => ({ padding: '9px 14px', borderRadius: 16, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--bg-card)', color: on ? 'var(--accent-contrast)' : 'var(--text-secondary)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}` });
const label = { fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '18px 0 8px' };

/**
 * "Copy to my log": a friend's day or meal goes into your diary; a recipe is
 * saved to your recipes (or logged as servings). Posts keep their credit via
 * source = 'community'; the copy is counted for the author.
 */
export default function CopySheet({ post, onClose, onDone }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const p = post.payload;
  const today = todayLocalDate();
  const isRecipe = post.kind === 'recipe';
  const [mode, setMode] = useState('save'); // recipes: save to my recipes, or log servings
  const [meal, setMeal] = useState(post.kind === 'day' ? 'asposted' : (p.meal || mealFromDate(new Date())));
  const [date, setDate] = useState(today);
  const [servings, setServings] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const logging = !isRecipe || mode === 'log';
  const target = meal === 'asposted' ? null : meal;

  async function submit() {
    if (busy) return;
    if (logging && !date) { setError('Pick a date.'); return; }
    if (isRecipe && mode === 'log' && !(Number(servings) > 0)) { setError('Enter how many servings.'); return; }
    setBusy(true);
    setError(null);
    try {
      let message;
      if (isRecipe && mode === 'save') {
        const row = recipePostToSavedMeal(post, user.id);
        await addSavedMeal(user.id, row.name, row.items, row.servings);
        message = `${row.name} saved to your recipes`;
      } else {
        const rows = postToLogRows(post, user.id, { meal: target || undefined, date, servings: Number(servings) || 1 });
        await insertFoodLogRows(rows);
        message = rows.length === 1 ? `${rows[0].food_name} added to ${mealLabel(rows[0].meal)}` : `${rows.length} items added to your log`;
      }
      await recordCopy(user.id, post.id).catch(() => {}); // the copy happened; the count is a courtesy
      onDone?.(message);
      close();
    } catch (err) {
      console.error('Copy failed:', err);
      setError(friendlyCommunityError(err));
    } finally {
      setBusy(false);
    }
  }

  const buttonText = busy ? 'Adding…' : isRecipe && mode === 'save' ? 'Save recipe' : post.kind === 'day' ? 'Add day to my log' : `Add to ${mealLabel(target || post.payload.meal) || 'my log'}`;

  return (
    <DragSheet
      title={isRecipe ? 'Copy recipe' : 'Copy to my log'}
      onClose={close}
      closing={closing}
      footer={
        <>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={submit} disabled={busy} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{buttonText}</button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>From @{post.username}</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', padding: '14px 16px', marginTop: 8 }}>
        <div style={{ fontSize: 16 }}>{p.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {Math.round(p.calories)} kcal{isRecipe ? ' per serving' : ''} · P {Math.round(p.protein_g)}g · C {Math.round(p.carbs_g)}g · F {Math.round(p.fat_g)}g
        </div>
        {post.kind === 'day' && <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 4 }}>{(p.items || []).length} items</div>}
      </div>

      {isRecipe && (
        <>
          <div style={label}>What to do</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" aria-pressed={mode === 'save'} onClick={() => setMode('save')} style={chip(mode === 'save')}>Save to my recipes</button>
            <button type="button" aria-pressed={mode === 'log'} onClick={() => setMode('log')} style={chip(mode === 'log')}>Log servings</button>
          </div>
        </>
      )}

      {logging && (
        <>
          <div style={label}>Add to</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {post.kind === 'day' && <button type="button" aria-pressed={meal === 'asposted'} onClick={() => setMeal('asposted')} style={chip(meal === 'asposted')}>Same meals</button>}
            {MEALS.map((m) => <button key={m} type="button" aria-pressed={meal === m} onClick={() => setMeal(m)} style={chip(meal === m)}>{mealLabel(m)}</button>)}
          </div>
          <label htmlFor="copy-date" style={label}>Day</label>
          <input id="copy-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit' }} />
        </>
      )}

      {isRecipe && mode === 'log' && (
        <>
          <label htmlFor="copy-servings" style={label}>Servings</label>
          <input id="copy-servings" type="number" inputMode="decimal" min="0.25" step="0.25" value={servings} onChange={(e) => setServings(e.target.value)} style={{ width: 120, boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit' }} />
        </>
      )}
    </DragSheet>
  );
}
