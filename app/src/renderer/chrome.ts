import { Button, directionOf, stickToScroll, stickToVelocity, type Direction } from "../shared/controllerInput.js";
import type { ControllerEvent, ShellCommand, ShellState } from "../shared/ipc.js";

declare global {
  interface Window {
    shell: {
      command(command: ShellCommand): void;
      controller(event: ControllerEvent): void;
      onState(callback: (state: ShellState) => void): void;
      onStatus(callback: (status: string) => void): void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const cmd = (command: ShellCommand): void => window.shell.command(command);

let state: ShellState | undefined;
let shift = false;
let keyboardWasOpen = false;
let lastSentLayout = "";

// ---- Rendering ----

function paintTheme(theme: ShellState["theme"]): void {
  const r = document.documentElement.style;
  r.setProperty("--accent", theme.accent);
  r.setProperty("--bg", theme.background);
  r.setProperty("--surface", theme.surface);
  r.setProperty("--text", theme.text);
  const v = parseInt(theme.accent.slice(1), 16);
  const lum = (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  r.setProperty("--accent-text", lum > 0.45 ? "#07120F" : "#FFFFFF");
}

function renderTabs(s: ShellState): void {
  const box = $("tabs");
  box.replaceChildren(
    ...s.tabs.map((t) => {
      const el = document.createElement("button");
      el.className = `tab${t.isActive ? " active" : ""}`;
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(t.isActive));
      el.title = t.url;
      el.dataset.id = String(t.id);
      if (t.favicon) {
        const img = document.createElement("img");
        img.src = t.favicon;
        img.alt = "";
        el.appendChild(img);
      }
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = t.title;
      el.appendChild(title);
      if (t.isPlayingAudio || t.isMuted) {
        const snd = document.createElement("button");
        snd.className = `snd${t.isMuted ? " muted" : ""}`;
        snd.textContent = t.isMuted ? "🔇" : "🔊";
        snd.title = "Mute / unmute · Ctrl+M";
        snd.addEventListener("click", (e) => { e.stopPropagation(); cmd({ type: "mute-tab", id: t.id }); });
        el.appendChild(snd);
      }
      const x = document.createElement("button");
      x.className = "x";
      x.textContent = "✕";
      x.setAttribute("aria-label", "Close tab");
      x.addEventListener("click", (e) => { e.stopPropagation(); cmd({ type: "close-tab", id: t.id }); });
      el.appendChild(x);
      el.addEventListener("click", () => cmd({ type: "activate-tab", id: t.id }));
      el.addEventListener("auxclick", (e) => { if (e.button === 1) cmd({ type: "close-tab", id: t.id }); });
      el.addEventListener("contextmenu", (e) => { e.preventDefault(); showTabMenu(t.id, e.clientX, e.clientY); });
      return el;
    }),
  );
}

function showTabMenu(id: number, x: number, y: number): void {
  document.getElementById("tabmenu")?.remove();
  const menu = document.createElement("div");
  menu.id = "tabmenu";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px;display:grid;gap:2px`;
  const items: [string, ShellCommand][] = [
    ["Mute / unmute", { type: "mute-tab", id }],
    ["Duplicate", { type: "duplicate-tab", id }],
    ["Close other tabs", { type: "close-other-tabs", id }],
    ["Reopen closed tab", { type: "reopen-tab" }],
    ["Close", { type: "close-tab", id }],
  ];
  for (const [label, command] of items) {
    const b = document.createElement("button");
    b.className = "sug";
    b.textContent = label;
    b.addEventListener("click", () => { cmd(command); menu.remove(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}

function render(s: ShellState): void {
  state = s;
  paintTheme(s.theme);
  renderTabs(s);
  const address = $<HTMLInputElement>("address");
  if (document.activeElement !== address || !s.keyboard) address.value = s.activeUrl;
  $("favorite").textContent = s.isFavorite ? "★" : "☆";
  $("favorite").classList.toggle("on", s.isFavorite);
  $("adblock").textContent = s.adBlock ? "ADBLOCK ON" : "ADBLOCK OFF";
  $("adblock").classList.toggle("on", s.adBlock);
  $("controller").textContent = s.controllerConnected ? "GAMEPAD · READY" : "GAMEPAD · SEARCHING";
  $("controller").classList.toggle("on", s.controllerConnected);
  $("status").textContent = s.status;
  document.body.classList.toggle("hidden-chrome", !s.chromeVisible);

  const perm = $("permission");
  perm.hidden = !s.permission;
  if (s.permission) {
    $("permission-text").textContent = `${s.permission.host} wants to use: ${s.permission.description}`;
    (perm.querySelector('[data-perm="deny"]') as HTMLButtonElement).focus();
  }

  const kb = $("keyboard");
  kb.hidden = !s.keyboard;
  if (s.keyboard) {
    $("keyboard-title").textContent = s.keyboard.title;
    if (!keyboardWasOpen) {
      if (s.keyboard.target === "address") { address.focus(); address.select(); }
      (document.querySelector("#keys .key") as HTMLButtonElement | null)?.focus();
    }
  }
  keyboardWasOpen = Boolean(s.keyboard);

  const find = $("findbar");
  find.hidden = !s.find;

  const sug = $("suggestions");
  sug.hidden = s.suggestions.length === 0 || !s.keyboard && document.activeElement !== address;
  sug.replaceChildren(
    ...s.suggestions.map((x) => {
      const b = document.createElement("button");
      b.className = "sug";
      b.setAttribute("role", "option");
      b.innerHTML = `<span>${escapeHtml(x.title)}</span><span class="u">${escapeHtml(x.url)}</span>`;
      b.addEventListener("click", () => { address.value = x.url; cmd({ type: "search-or-navigate", text: x.url }); });
      return b;
    }),
  );
  reportLayout();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Tells the main process how much of the window the chrome occupies so page views can fill the rest. */
function reportLayout(): void {
  const top = $("top").offsetHeight;
  const bottom = $("bottom").offsetHeight;
  const key = `${top}:${bottom}`;
  if (key === lastSentLayout) return;
  lastSentLayout = key;
  // Layout is sent over a dedicated channel so it never races with commands.
  (window as unknown as { shellLayout?: (t: number, b: number) => void }).shellLayout?.(top, bottom);
}

// ---- Wiring ----

function buildKeyboard(): void {
  const keys = $("keys");
  for (const row of ["1234567890", "qwertyuiop", "asdfghjkl.", "zxcvbnm-_/"]) {
    for (const ch of row) {
      const b = document.createElement("button");
      b.className = "key";
      b.dataset.char = ch;
      b.textContent = ch;
      b.addEventListener("click", () => typeText(shift ? ch.toUpperCase() : ch));
      keys.appendChild(b);
    }
  }
}

function typeText(text: string): void {
  if (!state?.keyboard) return;
  if (state.keyboard.target === "address") {
    const address = $<HTMLInputElement>("address");
    const start = address.selectionStart ?? address.value.length;
    const end = address.selectionEnd ?? start;
    address.value = address.value.slice(0, start) + text + address.value.slice(end);
    address.setSelectionRange(start + text.length, start + text.length);
    cmd({ type: "address-input", text: address.value });
  } else cmd({ type: "keyboard-insert", text });
}

function backspace(): void {
  if (!state?.keyboard) return;
  if (state.keyboard.target === "address") {
    const address = $<HTMLInputElement>("address");
    const start = address.selectionStart ?? address.value.length;
    const end = address.selectionEnd ?? start;
    if (end > start) address.value = address.value.slice(0, start) + address.value.slice(end);
    else if (start > 0) address.value = address.value.slice(0, start - 1) + address.value.slice(end);
    const caret = end > start ? start : Math.max(0, start - 1);
    address.setSelectionRange(caret, caret);
    cmd({ type: "address-input", text: address.value });
  } else cmd({ type: "keyboard-backspace" });
}

function submit(): void {
  if (!state?.keyboard) return;
  if (state.keyboard.target === "address") cmd({ type: "search-or-navigate", text: $<HTMLInputElement>("address").value });
  else cmd({ type: "keyboard-submit" });
}

function wire(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-cmd]")) el.addEventListener("click", () => cmd({ type: el.dataset.cmd as "back" }));
  for (const el of document.querySelectorAll<HTMLElement>("[data-win]")) el.addEventListener("click", () => cmd({ type: "window", action: el.dataset.win as "minimize" }));
  for (const el of document.querySelectorAll<HTMLElement>("[data-perm]")) {
    el.addEventListener("click", () => {
      const v = el.dataset.perm!;
      cmd({ type: "permission", allow: v.startsWith("allow"), remember: v.endsWith("always") });
    });
  }
  $("go").addEventListener("click", () => submit());
  $("favorite").addEventListener("click", () => cmd({ type: "toggle-favorite" }));
  const address = $<HTMLInputElement>("address");
  address.addEventListener("focus", () => { if (!state?.keyboard) cmd({ type: "keyboard-open", target: "address" }); });
  address.addEventListener("input", () => cmd({ type: "address-input", text: address.value }));
  address.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); cmd({ type: "search-or-navigate", text: address.value }); }
    else if (e.key === "Escape") { e.preventDefault(); cmd({ type: "keyboard-close" }); }
    else if (e.key === "ArrowDown") { const first = document.querySelector<HTMLButtonElement>("#suggestions .sug"); if (first) { e.preventDefault(); first.focus(); } }
  });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); address.focus(); address.select(); }
    if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); cmd({ type: "find", text: $<HTMLInputElement>("findtext").value }); $("findtext").focus(); }
  });
  for (const el of document.querySelectorAll<HTMLElement>("[data-key]")) {
    el.addEventListener("click", () => {
      switch (el.dataset.key) {
        case "shift": shift = !shift; for (const k of document.querySelectorAll<HTMLElement>("#keys .key")) k.textContent = shift ? k.dataset.char!.toUpperCase() : k.dataset.char!; break;
        case "space": typeText(" "); break;
        case "backspace": backspace(); break;
        case "enter": submit(); break;
        case "done": cmd({ type: "keyboard-close" }); break;
      }
    });
  }
  const findText = $<HTMLInputElement>("findtext");
  findText.addEventListener("input", () => cmd({ type: "find", text: findText.value }));
  findText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); cmd({ type: "find", text: findText.value, backwards: e.shiftKey }); }
    if (e.key === "Escape") { e.preventDefault(); cmd({ type: "find-close" }); }
  });
  $("findnext").addEventListener("click", () => cmd({ type: "find", text: findText.value }));
  $("findprev").addEventListener("click", () => cmd({ type: "find", text: findText.value, backwards: true }));
  $("findclose").addEventListener("click", () => cmd({ type: "find-close" }));
  new ResizeObserver(() => reportLayout()).observe(document.body);
}

// ---- Gamepad (standard mapping; works on Windows and Linux alike) ----

const pressed = new Set<number>();
let connected = false;
let lastDirectionAt = 0;
let lastTick = 0;

function overlayOpen(): boolean {
  return Boolean(state?.permission || state?.keyboard);
}

/** Moves focus among the shell's own buttons when an overlay is open (keyboard, permission prompt). */
function moveOverlayFocus(direction: Direction): void {
  const group = state?.permission ? $("permission") : $("keyboard");
  const buttons = [...group.querySelectorAll<HTMLButtonElement>("button")];
  const current = document.activeElement as HTMLButtonElement | null;
  const index = current ? buttons.indexOf(current) : -1;
  if (index < 0) { buttons[0]?.focus(); return; }
  const rect = current!.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let best: HTMLButtonElement | undefined, bestScore = Infinity;
  for (const b of buttons) {
    if (b === current) continue;
    const r = b.getBoundingClientRect();
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    const dx = bx - cx, dy = by - cy;
    const ahead = direction === "up" ? -dy : direction === "down" ? dy : direction === "left" ? -dx : dx;
    if (ahead <= 4) continue;
    const off = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
    const score = ahead + off * 2;
    if (score < bestScore) { best = b; bestScore = score; }
  }
  best?.focus();
}

function pollGamepad(now: number): void {
  requestAnimationFrame(pollGamepad);
  if (now - lastTick < 50) return;
  lastTick = now;
  const pads = navigator.getGamepads();
  const pad = pads.find((p) => p && p.mapping === "standard") ?? pads.find((p) => p) ?? null;
  if (!pad) {
    if (connected) { connected = false; window.shell.controller({ type: "connected", connected: false }); pressed.clear(); }
    return;
  }
  if (!connected) { connected = true; window.shell.controller({ type: "connected", connected: true }); }
  const down = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
  const justPressed = (i: number): boolean => {
    const is = down(i);
    const was = pressed.has(i);
    if (is) pressed.add(i); else pressed.delete(i);
    return is && !was;
  };
  const lb = down(Button.LB);
  if (justPressed(Button.LB) && !overlayOpen()) cmd({ type: "back" });
  if (justPressed(Button.RB)) cmd({ type: "forward" });
  if (justPressed(Button.X)) cmd({ type: "reload" });
  if (justPressed(Button.Y)) { if (lb) cmd({ type: "toggle-favorite" }); else cmd({ type: "keyboard-open", target: "address" }); }
  if (justPressed(Button.Start)) cmd({ type: "new-tab" });
  if (justPressed(Button.Back)) cmd({ type: "close-tab" });
  if (justPressed(Button.LT)) cmd({ type: "switch-tab", offset: -1 });
  if (justPressed(Button.RT)) cmd({ type: "switch-tab", offset: 1 });
  if (justPressed(Button.RightStick)) cmd({ type: "cycle-input-mode" });
  if (justPressed(Button.B)) {
    if (state?.permission) cmd({ type: "permission", allow: false, remember: false });
    else if (state?.keyboard) cmd({ type: "keyboard-close" });
    else cmd({ type: "back" });
  }
  if (justPressed(Button.A)) {
    if (overlayOpen()) (document.activeElement as HTMLButtonElement | null)?.click();
    else window.shell.controller({ type: "activate" });
  }
  const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0, ry = pad.axes[3] ?? 0;
  const dpad = { up: down(Button.DpadUp), down: down(Button.DpadDown), left: down(Button.DpadLeft), right: down(Button.DpadRight) };
  const cursorMode = state?.inputMode === "Cursor" && !overlayOpen();
  if (cursorMode) {
    const v = stickToVelocity(lx, ly);
    if (v.dx !== 0 || v.dy !== 0) window.shell.controller({ type: "cursor-move", dx: v.dx, dy: v.dy });
    const notches = stickToScroll(ry);
    if (notches !== 0) window.shell.controller({ type: "scroll", notches });
  }
  const direction = cursorMode ? directionOf(dpad, 0, 0) : directionOf(dpad, lx, ly);
  if (direction && now - lastDirectionAt >= 180) {
    lastDirectionAt = now;
    if (overlayOpen()) moveOverlayFocus(direction);
    else window.shell.controller({ type: "direction", direction });
  }
}

buildKeyboard();
wire();
window.shell.onState(render);
window.shell.onStatus((text) => { $("status").textContent = text; });
requestAnimationFrame(pollGamepad);
