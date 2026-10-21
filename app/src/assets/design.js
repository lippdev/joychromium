// The design catalog's live state. Movement itself is spatial.js; this only paints focus, selected and disabled
// beside each component and gives the interactive demos something to do.
(() => {
  const $ = (id) => document.getElementById(id);
  const post = (type, payload) => { try { window.joy.post({ type, ...payload }); } catch (_) {} };

  function paintState(item, key) {
    item.dataset.stateKey = key;
    const chip = item.querySelector('[data-state]');
    if (chip) chip.textContent = i18n.t('design.state.' + key);
  }

  function repaint() {
    for (const item of document.querySelectorAll('[data-demo]')) {
      paintState(item, item.dataset.stateKey || item.dataset.stateDefault || 'idle');
    }
  }

  document.addEventListener('focusin', (event) => {
    const item = event.target.closest('[data-demo]');
    if (item) paintState(item, 'focus');
  });
  document.addEventListener('focusout', (event) => {
    const item = event.target.closest('[data-demo]');
    if (!item || item.contains(event.relatedTarget)) return;
    paintState(item, item.dataset.stateDefault || 'idle');
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) tab.addEventListener('click', () => {
    for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
    const item = tab.closest('[data-demo]');
    item.dataset.stateDefault = 'selected';
    paintState(item, 'selected');
  });

  for (const key of document.querySelectorAll('.key[data-char]')) key.addEventListener('click', () => {
    const out = $('keyboardOutput');
    if (out.dataset.empty === 'true') { out.textContent = ''; out.dataset.empty = 'false'; }
    out.textContent += key.dataset.char;
  });

  const toastItem = document.querySelector('[data-demo="toast-message"]');
  const hideToast = () => {
    $('toastBox').replaceChildren();
    toastItem.dataset.stateDefault = 'hidden';
    paintState(toastItem, 'hidden');
  };
  let toastTimer = setTimeout(hideToast, 6000);
  $('toastShow').addEventListener('click', () => {
    const box = $('toastBox');
    box.replaceChildren();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = i18n.t('design.toast.message');
    box.appendChild(toast);
    toastItem.dataset.stateDefault = 'visible';
    paintState(toastItem, 'visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  });

  function init(msg) {
    i18n.set(msg.dictionary, msg.language);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', i18n.t(el.dataset.i18nAria));
    document.body.dataset.contrast = msg.highContrast ? 'high' : '';
    const root = document.documentElement.style;
    root.setProperty('--accent', msg.theme.accent);
    root.setProperty('--bg', msg.theme.background);
    root.setProperty('--surface', msg.theme.surface);
    root.setProperty('--text', msg.theme.text);
    const v = parseInt(msg.theme.accent.slice(1), 16);
    root.setProperty('--accent-text', (0.2126 * (v >> 16 & 255) + 0.7152 * (v >> 8 & 255) + 0.0722 * (v & 255)) / 255 > 0.45 ? '#0A0F1A' : '#FFFFFF');
    if (msg.uiScale) root.setProperty('--ui-scale', String(msg.uiScale));
    repaint();
    // The catalog starts on its first focusable component, so the D-pad has somewhere to go from.
    const first = document.querySelector('[data-demo] button:not([disabled]), [data-demo] input:not([disabled]), [data-demo] select:not([disabled])');
    if (first && document.activeElement === document.body) first.focus();
  }

  window.joy.onMessage((msg) => { if (msg.type === 'init') init(msg); });
  post('ready', {});
})();
