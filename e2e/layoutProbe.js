// Runs INSIDE the page (via page.evaluate) — must be fully self-contained.
// Returns { issues, notes }: issues fail the test, notes are informational.
export function probe({ ignore = [], scrolledToEnd = false } = {}) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const issues = [];
  const notes = [];

  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${id}${cls}>${txt ? ` "${txt}"` : ''}`;
  };
  const skip = (el) => ignore.some((sel) => el.closest(sel));
  const style = (el) => getComputedStyle(el);
  const visible = (el) => {
    const cs = style(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clipsX = (cs) => ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX);
  // Nearest ancestor (excluding html/body) that clips horizontally.
  const clipper = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (clipsX(style(p))) return p;
    }
    return null;
  };
  const stickyLayer = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) if (style(p).position === 'sticky') return true;
    return false;
  };
  const inFixedLayer = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) if (style(p).position === 'fixed') return true;
    return false;
  };

  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'PATH', 'CIRCLE', 'LINE', 'RECT', 'POLYLINE', 'G', 'DEFS', 'TITLE'].includes(el.tagName.toUpperCase()) && !skip(el));

  // 1. Anything poking out past the left/right edge of the screen (and not
  //    inside something that's meant to scroll or clip it).
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (clipper(el)) continue;
    if (style(el).position === 'fixed' && (r.left >= vw || r.right <= 0)) continue; // parked off-screen on purpose
    issues.push({ kind: 'off-screen', where: label(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} (viewport ${vw})` });
  }

  // 2. Text that's cut off with no ellipsis, or spilling out of the card /
  //    button it sits in.
  const container = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = style(p);
      const hasBox = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
      if (hasBox || clipsX(cs)) return p;
    }
    return null;
  };
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = style(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    if (el.closest('[data-marquee]')) continue;
    if (clipsX(cs) && cs.textOverflow === 'ellipsis') continue; // deliberately truncated with "…"
    // 2a. clipped by its own overflow
    if (clipsX(cs) && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      issues.push({ kind: 'clipped-text', where: label(el), detail: `content ${el.scrollWidth}px in ${el.clientWidth}px box, no ellipsis` });
      continue;
    }
    // 2b. spills past the container it lives in
    const range = document.createRange();
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      const tr = range.getBoundingClientRect();
      if (!tr.width) continue;
      const box = container(el);
      if (!box || box.closest('[data-marquee]')) continue;
      const br = box.getBoundingClientRect();
      if (clipsX(style(box)) && style(box).textOverflow === 'ellipsis') continue;
      if (['auto', 'scroll'].includes(style(box).overflowX)) continue; // horizontally scrollable strip — reachable by scrolling
      if (tr.right > br.right + 1.5 || tr.left < br.left - 1.5) {
        issues.push({ kind: 'text-spills-container', where: label(el), detail: `text ${Math.round(tr.left)}–${Math.round(tr.right)} vs container ${Math.round(br.left)}–${Math.round(br.right)} (${label(box)})` });
        break;
      }
    }
  }

  // 3. Interactive elements that another element is sitting on top of.
  const interactive = all.filter((el) => el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])') && visible(el));
  for (const el of interactive) {
    let r = el.getBoundingClientRect();
    // shrink to whatever part is actually visible inside clipping ancestors + viewport
    let left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, vw), bottom = Math.min(r.bottom, vh);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = style(p);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX) || ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        left = Math.max(left, pr.left); top = Math.max(top, pr.top); right = Math.min(right, pr.right); bottom = Math.min(bottom, pr.bottom);
      }
    }
    const w = right - left, h = bottom - top;
    if (w < 4 || h < 4) continue;
    if ((w * h) / (r.width * r.height) < 0.5) continue; // mostly scrolled out of view
    const cx = left + w / 2, cy = top + h / 2;
    const top_ = document.elementFromPoint(cx, cy);
    if (!top_) continue;
    if (el.contains(top_) || top_.contains(el)) continue;
    // Content sliding under fixed/sticky chrome while scrolling is normal —
    // the separate `trapped` check below covers content that can't escape it.
    if (inFixedLayer(top_) || stickyLayer(top_) || inFixedLayer(el)) continue;
    if (el.tagName === 'INPUT' && top_.closest('label') === el.closest('label') && el.closest('label')) continue;
    issues.push({ kind: 'covered', where: label(el), detail: `covered by ${label(top_)} at (${Math.round(cx)}, ${Math.round(cy)})` });
  }

  // 4. Small tap targets (informational — the phone project treats <32px as a note).
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width < 32 || r.height < 32) notes.push({ kind: 'small-target', where: label(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
  }
  // 6. The document itself must never scroll — every screen scrolls inside its
  //    own container. If the body is taller than the screen (typically the
  //    top inset stacked on a 100vh page) the bottom of the layout is off-screen.
  {
    const de = document.documentElement;
    if (de.scrollHeight > de.clientHeight + 1) {
      issues.push({ kind: 'page-taller-than-screen', where: '<html>', detail: `document is ${de.scrollHeight}px tall in a ${de.clientHeight}px screen` });
    }
  }

  // 5. With the page scrolled all the way down, the last piece of content must
  //    sit above any fixed bottom bar (nav / add button) — otherwise the user
  //    can never scroll it into reach.
  if (scrolledToEnd) {
    const bars = all.filter((el) => visible(el) && style(el).position === 'fixed' && el.getBoundingClientRect().bottom >= vh - 2 && el.getBoundingClientRect().height >= 30 && el.getBoundingClientRect().width >= 40);
    if (bars.length) {
      const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
      let lowest = null;
      for (const el of all) {
        if (!visible(el) || inFixedLayer(el) || el.children.length > 0 && !el.matches('button, a, input, select, textarea, [role=button]')) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= vh) continue; // not on screen
        if (!lowest || r.bottom > lowest.rect.bottom) lowest = { el, rect: r };
      }
      if (lowest && lowest.rect.bottom > barTop + 1) {
        issues.push({ kind: 'trapped-under-bar', where: label(lowest.el), detail: `bottom of page content ends at ${Math.round(lowest.rect.bottom)}px but the bottom bar starts at ${Math.round(barTop)}px` });
      }
    }
  }
  return { issues, notes };
}

// Scrolls the biggest scrollable area of the page to its end (returns false if
// nothing scrolls) so the "covered" check also sees content behind a bottom nav.
export function scrollToBottom() {
  let best = null;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!['auto', 'scroll'].includes(cs.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 4) continue;
    if (!best || el.scrollHeight - el.clientHeight > best.scrollHeight - best.clientHeight) best = el;
  }
  if (!best) return false;
  best.scrollTop = best.scrollHeight;
  return true;
}
