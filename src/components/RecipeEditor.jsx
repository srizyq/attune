import { useMemo, useState } from 'react';
import { editUnitsFor } from '../lib/foodMath';
import { ingredientEditState, evaluateRecipeDraft, snapshotIngredient } from '../lib/recipeEdit';
import FormRow from './FormRow';

// Edit a saved recipe inside its own sheet: rename it, change how many
// servings it makes, set each ingredient's amount and unit (everything else
// about it rescales to match), remove ingredients, or hop to food search to
// add more — taking the in-progress edits along. Renders the sheet's scroll
// body and its pinned Save / Cancel bar as two flex children.
const field = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8,
  padding: '9px 10px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', minWidth: 0,
};
const label = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' };

export default function RecipeEditor({ recipe, initialDraft = null, onCancel, onSave, onAddIngredient }) {
  const [name, setName] = useState(initialDraft?.name ?? recipe.name);
  const [servings, setServings] = useState(String(initialDraft?.servings ?? recipe.servings ?? 1));
  const [rows, setRows] = useState(() => (initialDraft?.items ?? recipe.items ?? []).map((item) => ({ item, ...ingredientEditState(item) })));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const evaluated = useMemo(() => evaluateRecipeDraft({ name, servings, rows }), [name, servings, rows]);
  const { items, totals, perServing, error } = evaluated;

  const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  async function handleSave() {
    if (error || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ name: name.trim(), servings: Number(servings), items: items.map(snapshotIngredient) });
    } catch (err) {
      console.error('Failed to save recipe edits:', err);
      setSaveError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  const currentDraft = () => ({ name: name.trim() || recipe.name, servings: Number(servings) > 0 ? Number(servings) : 1, items });

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 10, marginBottom: 16 }}>
          <div>
            <label htmlFor="recipe-name" style={label}>Name</label>
            <input id="recipe-name" style={{ ...field, width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="recipe-servings" style={label}>Makes</label>
            <input id="recipe-servings" style={{ ...field, width: '100%' }} type="number" inputMode="decimal" min="0" step="0.5" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
        </div>

        <div style={{ ...label, marginBottom: 8 }}>INGREDIENTS</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => {
            const hasWeight = !!r.item.servingGrams;
            const units = editUnitsFor(r.item);
            return (
              <li key={i} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(items[i].cal)} kcal</span>
                  <button onClick={() => removeRow(i)} aria-label={`Remove ${r.item.name}`} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '8px 6px', minHeight: 36 }}>
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    aria-label={`Amount of ${r.item.name}`}
                    style={{ ...field, width: 96 }}
                    type="number" inputMode="decimal" min="0" step="any"
                    value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })}
                  />
                  {hasWeight ? (
                    <select aria-label={`Unit for ${r.item.name}`} style={{ ...field, cursor: 'pointer' }} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })}>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>kcal — no weight on record, so protein/carbs/fat scale with the calories</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          onClick={() => onAddIngredient(currentDraft())}
          style={{ marginTop: 10, width: '100%', minHeight: 44, background: 'transparent', border: '1px dashed var(--border-active)', borderRadius: 12, color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <i className="ti ti-plus" aria-hidden="true" /> Add ingredient
        </button>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div data-testid="per-serving" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent)' }}>{Math.round(perServing.cal)} kcal</strong> per serving · P {perServing.protein}g · C {perServing.carbs}g · F {perServing.fat}g
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>{Math.round(totals.cal)} kcal for the whole recipe</div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px calc(12px + var(--safe-bottom, 0px))', borderTop: '1px solid var(--border-default)', background: 'var(--bg-card)' }}>
        {(error || saveError) && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--danger)' }}>{saveError || error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><FormRow.Button onClick={onCancel}>Cancel</FormRow.Button></div>
          <div style={{ flex: 2 }}>
            <FormRow.Button icon="ti-device-floppy" primary onClick={handleSave} disabled={!!error || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </FormRow.Button>
          </div>
        </div>
      </div>
    </>
  );
}
