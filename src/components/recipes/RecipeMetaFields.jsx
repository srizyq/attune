import { useEffect, useRef, useState } from 'react';
import { addTag, removeTag, suggestTags, MAX_TAGS, MAX_TAG_LENGTH } from '../../lib/recipeTags';
import { validateImageFile } from '../../lib/bodyProgress';

// The optional extras on a recipe: a photo, how long it takes, and tags the
// person types in themselves. Shared by the "new recipe" form and the editor.
// Everything is controlled by the parent; this only owns the text being typed
// and the preview of a chosen photo.
const field = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: '10px 12px',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', minWidth: 0,
};
const label = { display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' };

export default function RecipeMetaFields({
  photoUrl, onPickPhoto, onRemovePhoto, photoError,
  prep, onPrep, tags, onTags, allTags = [],
}) {
  const fileRef = useRef(null);
  const [typed, setTyped] = useState('');
  const [localPreview, setLocalPreview] = useState(null);
  const [problem, setProblem] = useState(null);

  // A chosen photo is previewed from the file itself, so it shows at once
  // (before it has been uploaded) and the object URL is released when it changes.
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  function chooseFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = validateImageFile(file);
    if (bad) { setProblem(bad); return; }
    setProblem(null);
    setLocalPreview(URL.createObjectURL(file));
    onPickPhoto(file);
  }

  function dropPhoto() {
    setLocalPreview(null);
    setProblem(null);
    onRemovePhoto();
  }

  const shown = localPreview || photoUrl;
  const suggestions = suggestTags(allTags, tags, typed);
  const full = tags.length >= MAX_TAGS;

  function commit(raw) {
    const next = addTag(tags, raw);
    if (next !== tags) onTags(next);
    setTyped('');
  }

  return (
    <div>
      <span style={label}>Photo</span>
      <input ref={fileRef} type="file" accept="image/*" onChange={chooseFile} aria-label="Choose a recipe photo" style={{ display: 'none' }} />
      {shown ? (
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 6, background: 'var(--bg-subtle)' }}>
          <img src={shown} alt="Recipe" style={{ display: 'block', width: '100%', height: 170, objectFit: 'cover' }} />
          <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => fileRef.current?.click()} style={overlayBtn}>Change</button>
            <button type="button" onClick={dropPhoto} style={overlayBtn} aria-label="Remove photo">Remove</button>
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => fileRef.current?.click()}
          style={{ width: '100%', minHeight: 48, borderRadius: 14, border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}
        >
          <i className="ti ti-photo-plus" aria-hidden="true" style={{ fontSize: 17 }} /> Add photo (optional)
        </button>
      )}
      {(problem || photoError) && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>{problem || photoError}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, marginTop: 14 }}>
        <div>
          <label htmlFor="recipe-prep" style={label}>Prep time (minutes, optional)</label>
          <input id="recipe-prep" type="number" inputMode="numeric" min="0" max="1440" step="1" placeholder="e.g. 15" value={prep} onChange={(e) => onPrep(e.target.value)} style={{ ...field, width: 140 }} />
        </div>

        <div>
          <label htmlFor="recipe-tag" style={label}>Tags (optional)</label>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {tags.map((t) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 4px 3px 10px', borderRadius: 99, background: 'var(--accent-bg)', color: 'var(--accent-secondary)', fontSize: 12, fontWeight: 700 }}>
                  {t}
                  <button type="button" onClick={() => onTags(removeTag(tags, t))} aria-label={`Remove tag ${t}`} style={{ width: 28, height: 28, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="recipe-tag" value={typed} maxLength={MAX_TAG_LENGTH} disabled={full}
              placeholder={full ? `Up to ${MAX_TAGS} tags` : 'Type a tag, e.g. Dessert'}
              onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) commit(v.slice(0, -1)); else setTyped(v); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(typed); } }}
              style={{ ...field, flex: 1 }}
            />
            <button type="button" onClick={() => commit(typed)} disabled={full || !typed.trim()} style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: 'none', background: !typed.trim() || full ? 'var(--chip-bg)' : 'var(--accent)', color: !typed.trim() || full ? 'var(--text-muted)' : 'var(--accent-contrast)', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: !typed.trim() || full ? 'not-allowed' : 'pointer' }}>
              Add
            </button>
          </div>
          {!full && suggestions.length > 0 && (
            <div role="group" aria-label="Your tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {suggestions.map((t) => (
                <button key={t} type="button" onClick={() => commit(t)} style={{ minHeight: 32, padding: '0 12px', borderRadius: 99, border: 'none', background: 'var(--chip-bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                  + {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayBtn = { minHeight: 34, padding: '0 12px', borderRadius: 99, border: 'none', background: 'rgba(20,14,10,0.72)', color: '#f6f2fa', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
