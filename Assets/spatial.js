// JoyChromium spatial navigation. Injected into every document; the shell calls window.__joy.move('up'|'down'|'left'|'right')
// and window.__joy.activate(). Focus is real DOM focus, so pages get their normal :focus / focusin behaviour.
(() => {
  if (window.__joy) return;
  const SELECTOR = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [contenteditable="true"], video[controls], audio[controls]';
  // The script runs before the document has a root; the focus style is attached lazily on first use.
  let styled = false;
  const ensureStyle = () => {
    if (styled) return;
    const parent = document.head || document.documentElement;
    if (!parent) return;
    const style = document.createElement('style');
    style.textContent = '.__joy-focus{outline:3px solid #64DDB5 !important;outline-offset:2px !important;border-radius:4px;}';
    parent.appendChild(style);
    styled = true;
  };

  let current = null;
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none' && !el.matches('a,button')) return false;
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  };
  const inViewport = r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const candidates = () => Array.from(document.querySelectorAll(SELECTOR)).filter(visible);
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const mark = el => {
    ensureStyle();
    if (current && current !== el) current.classList.remove('__joy-focus');
    current = el;
    el.classList.add('__joy-focus');
    try { el.focus({ preventScroll: true }); } catch (_) {}
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  const focused = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && visible(a)) return a;
    return current && document.contains(current) && visible(current) ? current : null;
  };
  // Score: distance along the axis dominates; off-axis distance is penalised; only elements ahead count.
  const pick = (from, dir) => {
    const fr = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
    const fc = center(fr);
    let best = null, bestScore = Infinity;
    for (const el of candidates()) {
      if (el === from) continue;
      const r = el.getBoundingClientRect();
      if (!inViewport(r)) continue;
      const c = center(r);
      let ahead, off;
      switch (dir) {
        case 'up': ahead = fr.top - r.bottom; off = Math.abs(c.x - fc.x); break;
        case 'down': ahead = r.top - fr.bottom; off = Math.abs(c.x - fc.x); break;
        case 'left': ahead = fr.left - r.right; off = Math.abs(c.y - fc.y); break;
        default: ahead = r.left - fr.right; off = Math.abs(c.y - fc.y); break;
      }
      if (ahead < -Math.min(r.height, r.width) / 2) continue; // overlapping or behind
      const overlap = dir === 'up' || dir === 'down'
        ? Math.max(0, Math.min(r.right, fr.right) - Math.max(r.left, fr.left))
        : Math.max(0, Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top));
      const score = Math.max(0, ahead) + off * (overlap > 0 ? 0.6 : 2.2);
      if (score < bestScore) { best = el; bestScore = score; }
    }
    return best;
  };
  const scroll = dir => {
    const dx = dir === 'left' ? -innerWidth / 2 : dir === 'right' ? innerWidth / 2 : 0;
    const dy = dir === 'up' ? -innerHeight / 2 : dir === 'down' ? innerHeight / 2 : 0;
    const before = [scrollX, scrollY];
    scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    return before[0] !== scrollX + dx || before[1] !== scrollY + dy;
  };
  window.__joy = {
    move(dir) {
      const from = focused();
      const next = pick(from, dir);
      if (next) { mark(next); return 'moved'; }
      scroll(dir);
      // After scrolling new elements may be in view; try once more on the next frame.
      requestAnimationFrame(() => { const n = pick(focused(), dir); if (n) mark(n); });
      return 'scrolled';
    },
    activate() {
      const el = focused();
      if (!el) return 'none';
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) { el.focus(); return 'focus'; }
      el.click();
      return 'click';
    },
    clear() { if (current) current.classList.remove('__joy-focus'); current = null; }
  };
})();
