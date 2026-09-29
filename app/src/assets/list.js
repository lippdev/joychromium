// Shared by favorites.html and history.html: theme paint, bridge, and a searchable list of {title,url,when?}.
const $ = id => document.getElementById(id);
const post = (type, payload) => { try { window.joy.post({ type, ...payload }); } catch (_) {} };
function paint(t) {
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent); r.setProperty('--bg', t.background); r.setProperty('--surface', t.surface); r.setProperty('--text', t.text);
  const v = parseInt(t.accent.slice(1), 16);
  r.setProperty('--accent-text', (0.2126 * (v >> 16 & 255) + 0.7152 * (v >> 8 & 255) + 0.0722 * (v & 255)) / 255 > 0.45 ? '#07120F' : '#FFFFFF');
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function renderList(box, items, { removeType, emptyText }) {
  if (!items.length) { box.innerHTML = `<p class="empty">${esc(emptyText)}</p>`; return; }
  box.replaceChildren(...items.map(item => {
    const row = document.createElement('div'); row.className = 'item';
    const open = document.createElement('button'); open.className = 'open';
    open.innerHTML = `<span class="t">${esc(item.title || item.url)}</span><span class="u">${esc(item.url)}</span>` + (item.when ? `<span class="w">${esc(item.when)}</span>` : '');
    open.addEventListener('click', () => post('navigate', { url: item.url }));
    const del = document.createElement('button'); del.className = 'del'; del.title = 'Remove'; del.textContent = '✕';
    del.addEventListener('click', () => { post(removeType, { url: item.url }); row.remove(); if (!box.children.length) renderList(box, [], { removeType, emptyText }); });
    row.append(open, del); return row;
  }));
}
