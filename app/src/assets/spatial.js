// JoyChromium spatial navigation. Injected into every frame, in its own world; the shell calls window.__joy.move(...),
// window.__joy.activate() and the media actions. Focus is real DOM focus, so pages get their normal :focus / focusin behaviour.
(() => {
  if (window.__joy) return;
  const SELECTOR = 'a[href], button, iframe:not([tabindex="-1"]), input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [contenteditable="true"], video[controls], audio[controls]';
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
  const pick = (fr, dir, from) => {
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
  const viewportCenter = () => ({ left: innerWidth / 2, top: innerHeight / 2, right: innerWidth / 2, bottom: innerHeight / 2, width: 0, height: 0 });

  // ---- Focus across frames ----
  // The D-pad acts on the frame that holds the focus. A direction pressed on an <iframe> goes into its document, starting
  // from the edge it came through; a frame with nothing ahead hands the direction back to its parent, which continues from
  // the <iframe>; the top frame scrolls. Frames pass those directions by postMessage, so a cross-origin player is crossed
  // like a same-origin one. A page can post the same messages, and the worst it can do is move the focus.
  const post = (win, message) => {
    try { if (win) win.postMessage(message, '*'); } catch (_) {}
  };
  const isFrame = el => Boolean(el) && el.tagName === 'IFRAME';
  const focusedFrame = () => (isFrame(document.activeElement) ? document.activeElement : null);
  // Calls into a child frame and waits for its answer; a frame without the script (or a dead one) answers undefined.
  const pending = new Map();
  let calls = 0;
  const call = (frame, method, arg) => new Promise(resolve => {
    const id = ++calls;
    pending.set(id, resolve);
    post(frame.contentWindow, { joy: 'call', id, method, arg });
    setTimeout(() => { if (pending.delete(id)) resolve(undefined); }, 250);
  });
  const enterRect = dir => dir === 'up' || dir === 'left'
    ? { left: innerWidth, top: innerHeight, right: innerWidth, bottom: innerHeight, width: 0, height: 0 }
    : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const enterFrame = dir => {
    const next = pick(enterRect(dir), dir) || candidates()[0] || null;
    if (next) {
      mark(next);
      if (isFrame(next)) post(next.contentWindow, { joy: 'enter', dir });
      return 'moved';
    }
    // Nothing to focus here: hand the direction back, so an empty frame cannot trap the D-pad.
    if (window !== window.top) post(window.parent, { joy: 'exit', dir });
    return 'none';
  };
  const moveFrom = (fromEl, dir) => {
    const from = fromEl || focused();
    const next = pick(from ? from.getBoundingClientRect() : viewportCenter(), dir, from);
    if (next) {
      mark(next);
      if (isFrame(next)) post(next.contentWindow, { joy: 'enter', dir });
      return 'moved';
    }
    if (window !== window.top) { post(window.parent, { joy: 'exit', dir }); return 'exit'; }
    scroll(dir);
    // After scrolling new elements may be in view; try once more on the next frame.
    requestAnimationFrame(() => {
      const again = focused();
      const n = pick(again ? again.getBoundingClientRect() : viewportCenter(), dir, again);
      if (n) mark(n);
    });
    return 'scrolled';
  };
  const forwardMedia = method => {
    const frame = focusedFrame();
    return frame ? call(frame, method).then(Boolean) : false;
  };

  const scroll = dir => {
    const dx = dir === 'left' ? -innerWidth / 2 : dir === 'right' ? innerWidth / 2 : 0;
    const dy = dir === 'up' ? -innerHeight / 2 : dir === 'down' ? innerHeight / 2 : 0;
    scrollBy({ left: dx, top: dy, behavior: 'smooth' });
  };
  // Media: play/pause and track skipping through the page's own player. The media session gets the same actions, so
  // the hardware media keys work even on a page that does not implement them.
  const mediaElements = () => Array.from(document.querySelectorAll('video,audio'));
  const hasSource = el => Boolean(el.currentSrc || el.srcObject || el.getAttribute('src') || el.querySelector('source'));
  const playing = el => !el.paused && !el.ended;
  const audible = el => !el.muted && el.volume > 0;
  const anyMedia = () => mediaElements().find(playing) || mediaElements().find(hasSource) || null;
  const invoke = (el, method) => {
    try {
      const result = el[method]();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) {}
  };
  // A only takes over a video that is really playing with sound; a muted background video keeps A on focus.
  const playPause = () => {
    const el = mediaElements().find(m => playing(m) && audible(m));
    if (!el) return 'focus';
    invoke(el, 'pause');
    return 'media';
  };
  // The media keys and the quick menu are an explicit request, so they also resume a paused track.
  const mediaToggle = () => {
    const el = anyMedia();
    if (!el) return false;
    invoke(el, el.paused ? 'play' : 'pause');
    return true;
  };
  // Picture-in-picture: the browser's own PiP window, for the quick menu. An element already in it gets it closed;
  // otherwise the first video with frames goes into the window. False when this frame has neither.
  const pictureInPicture = () => {
    const open = document.pictureInPictureElement;
    if (open) { invoke(document, 'exitPictureInPicture'); return true; }
    if (!document.pictureInPictureEnabled) return false;
    const videos = mediaElements().filter(v => v.tagName === 'VIDEO' && !v.disablePictureInPicture && v.readyState >= 2);
    const el = videos.find(playing) || videos[0];
    if (!el) return false;
    invoke(el, 'requestPictureInPicture');
    return true;
  };
  const skip = dir => {
    if (!anyMedia()) return false;
    const control = document.querySelector(dir === 'next'
      ? '[aria-label*="next" i], .ytp-next-button, [data-testid*="next" i]'
      : '[aria-label*="previous" i], .ytp-prev-button, [data-testid*="prev" i]');
    if (!control) return false;
    control.click();
    return true;
  };
  const session = navigator.mediaSession;
  if (session && typeof session.setActionHandler === 'function') {
    const handlers = {
      play: () => { const el = anyMedia(); if (el && el.paused) invoke(el, 'play'); },
      pause: () => { const el = anyMedia(); if (el && !el.paused) invoke(el, 'pause'); },
      nexttrack: () => skip('next'),
      previoustrack: () => skip('previous'),
    };
    for (const action in handlers) {
      try { session.setActionHandler(action, handlers[action]); } catch (_) {}
    }
  }
  const api = {
    move(dir) {
      const frame = focusedFrame();
      // The focused frame owns the direction; one that never answers (no script, or a dead document) hands it back here.
      return frame ? call(frame, 'move', dir).then(r => (r === undefined ? moveFrom(frame, dir) : r)) : moveFrom(null, dir);
    },
    activate() {
      const el = focused();
      if (!el) return 'none';
      if (isFrame(el)) { post(el.contentWindow, { joy: 'activate' }); return 'forwarded'; }
      const tag = el.tagName;
      const textual = tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable ||
        (tag === 'INPUT' && !['checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'color', 'range'].includes((el.type || 'text').toLowerCase()));
      if (textual) { el.focus(); return 'focus'; }
      el.click();
      return 'click';
    },
    playPause() {
      const decision = playPause();
      if (decision === 'media') return decision;
      const frame = focusedFrame();
      // A player inside an iframe owns its <video>: ask that frame instead of guessing.
      return frame ? call(frame, 'playPause').then(v => (v === 'media' ? 'media' : 'focus')) : decision;
    },
    mediaToggle() { return mediaToggle() || forwardMedia('mediaToggle'); },
    mediaNext() { return skip('next') || forwardMedia('mediaNext'); },
    mediaPrevious() { return skip('previous') || forwardMedia('mediaPrevious'); },
    mediaPictureInPicture() { return pictureInPicture() || forwardMedia('mediaPictureInPicture'); },
    clear() { if (current) current.classList.remove('__joy-focus'); current = null; }
  };
  window.__joy = api;

  addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.joy !== 'string') return;
    if (data.joy === 'reply') {
      const done = pending.get(data.id);
      if (done) { pending.delete(data.id); done(data.value); }
      return;
    }
    if (data.joy === 'exit') {
      // A child frame ran out of room: focus its <iframe> and carry the direction on from there.
      const sender = Array.from(document.querySelectorAll('iframe')).find(f => f.contentWindow === event.source);
      if (sender) { mark(sender); moveFrom(sender, data.dir); }
      return;
    }
    // Only the parent frame commands a frame, and only with the messages handled here.
    if (event.source !== window.parent) return;
    if (data.joy === 'enter') { enterFrame(data.dir); return; }
    if (data.joy === 'activate') { api.activate(); return; }
    if (data.joy === 'call') {
      const method = api[data.method];
      Promise.resolve(typeof method === 'function' ? method(data.arg) : undefined)
        .then(value => post(event.source, { joy: 'reply', id: data.id, value }));
    }
  });
})();

// Virtual cursor overlay (Cursor input mode). The shell moves it and sends real mouse events at the same point.
(() => {
  if (window.__joyCursor) return;
  let el = null;
  const ensure = () => {
    if (el && document.contains(el)) return el;
    el = document.createElement('div');
    el.id = '__joy-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:26px;z-index:2147483647;pointer-events:none;display:none;' +
      'background:url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 28"><path d="M1 1 L1 23 L7 18 L11 27 L14 26 L10 17 L17 17 Z" fill="#64DDB5" stroke="#07120F" stroke-width="1.5"/></svg>') + '") no-repeat;';
    (document.body || document.documentElement).appendChild(el);
    return el;
  };
  window.__joyCursor = {
    show(visible, x, y) {
      const c = ensure();
      c.style.display = visible ? 'block' : 'none';
      c.style.transform = `translate(${x}px, ${y}px)`;
    },
  };
})();
