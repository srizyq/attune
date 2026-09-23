import { useEffect, useRef, useState } from 'react';

// Turns a displayed number (the big calorie figure, a macro's %) into a
// tap-to-type field without disturbing whatever slider sits next to it —
// both go through the exact same onChange, and a typed value is clamped to
// [min, max] so it can never land somewhere the slider itself couldn't.
export default function EditableNumber({ value, min, max, onChange, suffix = '', style, ariaLabel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const n = Math.round(Number(draft));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
        }}
        aria-label={ariaLabel}
        style={{
          font: 'inherit', color: 'inherit', textAlign: 'center',
          background: 'var(--bg-primary)', border: '1px solid var(--border-active)', borderRadius: 8,
          padding: '0 4px', outline: 'none', ...style,
        }}
      />
    );
  }
  return (
    <button
      type="button"
      // The small macro-% numbers are ~16px tall as plain text — .hit-slop
      // extends the actual tap area outward without changing how big the
      // number looks (see appshell.css), the same trick used elsewhere in
      // the app for other glyph-sized controls.
      className="hit-slop"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      title="Tap to type a number"
      style={{
        font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', borderBottom: '1px dashed currentColor', lineHeight: 1.1, ...style,
      }}
    >
      {value.toLocaleString()}{suffix}
    </button>
  );
}
