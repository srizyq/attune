// Runs inside the page (via page.evaluate) — so it must stay self-contained.
// Returns a list of layout problems on whatever screen is showing:
//   page-scrolls-sideways, text-off-screen, text-clipped (cut off with no
//   ellipsis), text-overlaps-text, nav-label-clipped, nav-off-screen.
// Text that is cut with an ellipsis is measured by its box (its hidden tail
// isn't drawn), and the fixed bottom bar / side bar are ignored when comparing
// text — page content is meant to scroll underneath them.
export function findLayoutProblems() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push({ check: 'page-scrolls-sideways', msg: `${de.scrollWidth}px of content in a ${de.clientWidth}px window` });
  const visible = (e) => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clippedByAncestor = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const label = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${(e.textContent || '').trim().slice(0, 28)}"`;
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && !e.closest('[aria-hidden="true"]') && visible(e));

  for (const e of all) {
    if (getComputedStyle(e).position === 'fixed' && e.children.length > 3) continue;
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clippedByAncestor(e) && e.children.length === 0 && (e.textContent || '').trim()) out.push({ check: 'text-off-screen', msg: label(e) });
  }

  for (const e of all) {
    if (e.children.length) continue;
    const st = getComputedStyle(e);
    if (!/(hidden|clip)/.test(st.overflowX) || st.textOverflow === 'ellipsis') continue;
    if (e.scrollWidth > e.clientWidth + 2 && (e.textContent || '').trim()) out.push({ check: 'text-clipped', msg: label(e) });
  }

  const textBox = (e) => {
    const st = getComputedStyle(e);
    if (st.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) return e.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(e);
    return range.getBoundingClientRect();
  };
  const leaves = all.filter((e) => e.children.length === 0 && (e.textContent || '').trim() && !/^(OPTION|SCRIPT|STYLE)$/.test(e.tagName));
  const boxes = leaves.map((e) => ({ e, r: textBox(e) })).filter((b) => b.r.width > 2 && b.r.height > 2 && b.r.bottom > 0 && b.r.top < innerHeight * 6);
  const layer = (e) => e.closest('[role="dialog"], .modal-backdrop, .sheet-panel');
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (a.e.closest('.app-bottom-nav, .app-sidebar') || b.e.closest('.app-bottom-nav, .app-sidebar')) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 3 && oy > 3 && layer(a.e) === layer(b.e)) out.push({ check: 'text-overlaps-text', msg: `${label(a.e)}  and  ${label(b.e)}` });
    }
  }

  for (const l of document.querySelectorAll('.app-bottom-icon-label')) {
    if (visible(l) && l.scrollWidth > l.clientWidth + 1) out.push({ check: 'nav-label-clipped', msg: l.textContent });
  }
  const nav = document.querySelector('.app-bottom-nav');
  if (nav && visible(nav)) {
    const r = nav.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push({ check: 'nav-off-screen', msg: `${Math.round(r.left)} to ${Math.round(r.right)} of ${vw}` });
  }
  return out;
}
