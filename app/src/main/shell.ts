import { BrowserWindow, ipcMain, powerSaveBlocker, session, type Session, type WebContents } from "electron";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Channels, type ControllerEvent, type PermissionPrompt, type ShellCommand, type ShellState } from "../shared/ipc";
import { displayUrl, isInternal, isWebUrl, Pages } from "../shared/pages";
import { hostOf, isDangerousDownload, safeFileName, allowPopup } from "../shared/security";
import { buildSearchUrl, isFavorite, newTabTarget, toggleFavorite, withInputMode, withPermission, type InputMode } from "../shared/settings";
import { buildSuggestions } from "../shared/suggestion";
import { defaultModeFor, nextMode } from "../shared/controllerInput";
import type { AdBlock } from "./adblock";
import { sendArrow, sendKey, spatialActivate, spatialMove, VirtualCursor } from "./controllerActions";
import type { History } from "./history";
import type { Log } from "./log";
import { PageBridge } from "./pageBridge";
import type { PolicyService } from "./policyService";
import type { SettingsStore } from "./store";
import { Tab, TabManager } from "./tabs";

export interface ShellDeps {
  store: SettingsStore;
  history: History;
  policy: PolicyService;
  adblock: AdBlock;
  log: Log;
  distDir: string;
  spatialScript: string;
  appVersion: string;
  updateStatus: () => string;
  checkUpdates: () => Promise<void>;
  exportDiagnostics: () => Promise<string>;
}

const PERMISSION_TEXT: Record<string, string> = {
  media: "your camera or microphone",
  geolocation: "your location",
  notifications: "notifications",
  midi: "MIDI devices",
  midiSysex: "MIDI devices",
  pointerLock: "locking the pointer",
  fullscreen: "full screen",
  openExternal: "opening another app",
  "clipboard-read": "reading the clipboard",
  "display-capture": "capturing the screen",
  "idle-detection": "idle detection",
  "window-management": "window placement",
  "speaker-selection": "audio outputs",
};

/** The browser window: shell UI on the window's own web contents, one WebContentsView per tab laid out beneath the chrome. */
export class Shell {
  readonly window: BrowserWindow;
  readonly tabs: TabManager;
  private layout = { top: 90, bottom: 26 };
  private chromeVisible = true;
  private inputMode: InputMode = "Spatial";
  private status = "STARTING · TV IDENTITY ON";
  private keyboard: ShellState["keyboard"];
  private find: ShellState["find"];
  private suggestions: ShellState["suggestions"] = [];
  private controllerConnected = false;
  private pendingPermission: { prompt: PermissionPrompt; resolve: (allow: boolean) => void } | undefined;
  private readonly httpAllowedHosts = new Set<string>();
  private readonly recentPopups: number[] = [];
  private readonly cursor = new VirtualCursor();
  private sleepBlocker: number | undefined;
  private readonly bridge: PageBridge;
  private lastSavedSession = "";

  constructor(private readonly deps: ShellDeps) {
    this.window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      backgroundColor: deps.store.current.theme.background,
      title: "JoyChromium",
      show: false,
      webPreferences: { preload: join(deps.distDir, "preload", "chrome.js"), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.tabs = new TabManager({
      preloadDir: join(deps.distDir, "preload"),
      spatialScript: deps.spatialScript,
      httpsOnly: () => deps.store.current.httpsOnly,
      httpAllowedHosts: this.httpAllowedHosts,
      hostBlocked: (host) => deps.policy.current.blockedHosts.some((b) => host === b || host?.endsWith(`.${b}`) === true),
      prepareSession: (ses) => this.prepareSession(ses),
      log: deps.log,
    });
    this.bridge = new PageBridge(this, deps);
    this.wireTabs();
    this.wireWindow();
    this.wireIpc();
  }

  // ---- Lifecycle ----

  async start(targets: readonly string[]): Promise<void> {
    await this.window.loadURL("joychromium://chrome/");
    this.window.show();
    targets.forEach((url, i) => this.tabs.open(url, { activate: i === 0 }));
    setInterval(() => this.housekeeping(), 30_000).unref();
  }

  get activeTab(): Tab | undefined {
    return this.tabs.active;
  }

  get activeWebContents(): WebContents | undefined {
    return this.tabs.activeWebContents;
  }

  setStatus(text: string): void {
    this.status = text;
    this.window.webContents.send(Channels.shellStatus, text);
  }

  // ---- Session hardening (per session: default and each private partition) ----

  private prepareSession(ses: Session): void {
    const s = this.deps.store.current;
    ses.setUserAgent(session.defaultSession.getUserAgent());
    if (s.adBlockEnabled) this.deps.adblock.enable(ses);
    ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
      void this.decidePermission(permission, details.requestingUrl).then(callback);
    });
    ses.setPermissionCheckHandler((_wc, permission, origin) => {
      const host = hostOf(origin);
      // Always read the live settings: "allow always" replaces the settings object after this handler is installed.
      const remembered = host ? this.deps.store.current.sitePermissions[host]?.[permission] : undefined;
      return remembered === true;
    });
    ses.on("will-download", (_event, item) => this.handleDownload(item));
    ses.setSpellCheckerEnabled(false);
  }

  private async decidePermission(kind: string, url: string): Promise<boolean> {
    const host = hostOf(url);
    if (!host || isInternal(url)) return false;
    const remembered = this.deps.store.current.sitePermissions[host]?.[kind];
    if (remembered !== undefined) return remembered;
    // Only one prompt at a time; anything that piles up behind it is denied for this request.
    if (this.pendingPermission) return false;
    return new Promise<boolean>((resolve) => {
      this.pendingPermission = { prompt: { host, kind, description: PERMISSION_TEXT[kind] ?? kind }, resolve };
      this.broadcast();
    });
  }

  resolvePermission(allow: boolean, remember: boolean): void {
    const pending = this.pendingPermission;
    if (!pending) return;
    this.pendingPermission = undefined;
    if (remember) this.deps.store.update((s) => withPermission(s, pending.prompt.host, pending.prompt.kind, allow));
    pending.resolve(allow);
    this.broadcast();
  }

  private handleDownload(item: Electron.DownloadItem): void {
    const name = safeFileName(item.getFilename());
    const s = this.deps.store.current;
    if (s.blockDangerousDownloads && isDangerousDownload(name, this.deps.policy.current.extraDangerousExtensions)) {
      item.cancel();
      this.setStatus(`DOWNLOAD BLOCKED · ${name}`);
      return;
    }
    const folder = join(homedir(), "Downloads", "JoyChromium");
    mkdirSync(folder, { recursive: true });
    let target = join(folder, name);
    const dot = name.lastIndexOf(".");
    for (let i = 1; existsSync(target); i++) target = join(folder, dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`);
    item.setSavePath(target);
    item.on("updated", () => {
      const total = item.getTotalBytes();
      this.setStatus(total > 0 ? `DOWNLOADING · ${name} · ${Math.round((item.getReceivedBytes() * 100) / total)}%` : `DOWNLOADING · ${name}`);
    });
    item.once("done", (_event, state) => this.setStatus(state === "completed" ? `DOWNLOADED · ${name}` : `DOWNLOAD ${state.toUpperCase()} · ${name}`));
  }

  // ---- Tabs and layout ----

  private wireTabs(): void {
    this.tabs.on("changed", () => this.syncViews());
    this.tabs.on("status", (text) => this.setStatus(text));
    this.tabs.on("visited", (url, title) => this.deps.history.record(url, title));
    this.tabs.on("fullscreen", (tab, on) => {
      if (tab === this.tabs.active) this.setChromeVisible(!on);
    });
    this.tabs.on("popup", (url, from) => {
      if (!allowPopup(this.recentPopups, Date.now())) {
        this.setStatus("POPUP BLOCKED");
        return;
      }
      this.tabs.open(url, { isPrivate: from.isPrivate });
    });
  }

  private wireWindow(): void {
    this.window.on("resize", () => this.applyBounds());
    this.window.on("maximize", () => this.applyBounds());
    this.window.on("unmaximize", () => this.applyBounds());
    this.window.on("close", () => this.deps.store.saveSession(this.tabs.sessionUrls()));
    this.window.webContents.on("before-input-event", (event, input) => this.handleShortcut(event, input));
    this.window.webContents.on("render-process-gone", (_e, details) => this.deps.log.error(`Shell UI renderer gone: ${details.reason}`));
  }

  private readonly wired = new WeakSet<Tab>();

  private syncViews(): void {
    const contentView = this.window.contentView;
    for (const tab of this.tabs.tabs) {
      if (!this.wired.has(tab)) {
        this.wired.add(tab);
        this.attachShortcuts(tab.webContents);
      }
      if (!contentView.children.includes(tab.view)) contentView.addChildView(tab.view);
      tab.view.setVisible(tab === this.tabs.active);
    }
    for (const child of contentView.children) {
      if (child instanceof Object && !this.tabs.tabs.some((t) => t.view === child)) contentView.removeChildView(child);
    }
    this.applyBounds();
    this.refreshInputMode();
    this.updateKeepAwake();
    this.broadcast();
  }

  private applyBounds(): void {
    const [width, height] = this.window.getContentSize();
    const top = this.chromeVisible ? this.layout.top : 0;
    const bottom = this.chromeVisible ? this.layout.bottom : 0;
    const bounds = { x: 0, y: top, width: width ?? 0, height: Math.max(0, (height ?? 0) - top - bottom) };
    for (const tab of this.tabs.tabs) tab.view.setBounds(bounds);
  }

  setLayout(top: number, bottom: number): void {
    this.layout = { top, bottom };
    this.applyBounds();
  }

  private setChromeVisible(visible: boolean): void {
    this.chromeVisible = visible;
    if (!visible && !this.window.isFullScreen()) this.window.setFullScreen(true);
    if (visible && this.window.isFullScreen()) this.window.setFullScreen(false);
    this.applyBounds();
    this.broadcast();
  }

  private housekeeping(): void {
    const urls = this.tabs.sessionUrls();
    const key = urls.join("\n");
    if (key !== this.lastSavedSession) {
      this.deps.store.saveSession(urls);
      this.lastSavedSession = key;
    }
  }

  private updateKeepAwake(): void {
    const playing = this.tabs.tabs.some((t) => t.isPlayingAudio && !t.isMuted);
    if (playing && this.sleepBlocker === undefined) this.sleepBlocker = powerSaveBlocker.start("prevent-display-sleep");
    if (!playing && this.sleepBlocker !== undefined) {
      powerSaveBlocker.stop(this.sleepBlocker);
      this.sleepBlocker = undefined;
    }
  }

  // ---- State to the chrome UI ----

  broadcast(): void {
    const s = this.deps.store.current;
    const active = this.tabs.active;
    const state: ShellState = {
      tabs: this.tabs.snapshot(),
      activeUrl: active?.url ?? "",
      isFavorite: active ? isFavorite(s, active.url) : false,
      inputMode: this.inputMode,
      adBlock: this.deps.adblock.isReady && s.adBlockEnabled,
      controllerConnected: this.controllerConnected,
      chromeVisible: this.chromeVisible,
      permission: this.pendingPermission?.prompt,
      theme: s.theme,
      status: this.status,
      keyboard: this.keyboard,
      find: this.find,
      suggestions: this.suggestions,
    };
    if (!this.window.isDestroyed()) this.window.webContents.send(Channels.shellState, state);
  }

  // ---- Commands from the chrome UI ----

  private wireIpc(): void {
    ipcMain.on(Channels.shellCommand, (event, command: ShellCommand) => {
      if (event.sender !== this.window.webContents) return;
      void this.handle(command).catch((error) => this.deps.log.error(`Command ${command.type} failed`, error));
    });
    ipcMain.on(Channels.controller, (event, input: ControllerEvent) => {
      if (event.sender !== this.window.webContents) return;
      void this.handleController(input).catch((error) => this.deps.log.error(`Controller ${input.type} failed`, error));
    });
    ipcMain.on(Channels.pageFocusIn, (event) => {
      if (this.tabs.active && event.sender === this.tabs.active.webContents) this.openKeyboard("page");
    });
    ipcMain.on(Channels.pageMessage, (event, message: unknown) => {
      const tab = this.tabs.tabs.find((t) => t.webContents === event.sender);
      if (tab) void this.bridge.handle(tab, message).catch((error) => this.deps.log.error("Page message failed", error));
    });
    ipcMain.on("shell:layout", (event, top: number, bottom: number) => {
      if (event.sender === this.window.webContents) this.setLayout(top, bottom);
    });
  }

  navigate(url: string, allowHttp = false): void {
    const tab = this.tabs.active ?? this.tabs.open(Pages.newtab);
    if (allowHttp) {
      const host = hostOf(url);
      if (host) this.httpAllowedHosts.add(host);
    }
    this.closeKeyboard();
    void this.tabs.load(tab, url);
  }

  searchOrNavigate(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const url = isWebUrl(trimmed) || isInternal(trimmed) ? trimmed : buildSearchUrl(this.deps.store.current.searchEngine, trimmed);
    this.navigate(url);
  }

  newTab(isPrivate = false): void {
    const target = isPrivate ? Pages.newtab : newTabTarget(this.deps.store.current);
    this.tabs.open(target, { isPrivate });
    if (target !== Pages.newtab) this.openKeyboard("address");
  }

  private openKeyboard(target: "address" | "page"): void {
    this.keyboard = { target, title: target === "address" ? "ADDRESS / SEARCH" : "PAGE TEXT ENTRY" };
    this.broadcast();
  }

  private closeKeyboard(): void {
    if (!this.keyboard) return;
    this.keyboard = undefined;
    this.suggestions = [];
    this.broadcast();
  }

  private async insertIntoPage(text: string): Promise<void> {
    const wc = this.activeWebContents;
    if (!wc) return;
    const literal = JSON.stringify(text);
    await wc.executeJavaScript(
      `(() => {
        const text = ${literal};
        const field = document.activeElement;
        if (!field) return;
        if (field.isContentEditable) { document.execCommand(text === '' ? 'delete' : 'insertText', false, text === '' ? undefined : text); return; }
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
        const start = typeof field.selectionStart === 'number' ? field.selectionStart : field.value.length;
        const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start;
        const next = text === '' ? field.value.slice(0, Math.max(0, start - 1)) + field.value.slice(end) : field.value.slice(0, start) + text + field.value.slice(end);
        const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, next);
        const caret = text === '' ? Math.max(0, start - 1) : start + text.length;
        if (typeof field.setSelectionRange === 'function') field.setSelectionRange(caret, caret);
        field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text === '' ? 'deleteContentBackward' : 'insertText', data: text === '' ? null : text }));
      })()`,
      true,
    );
  }

  private async submitPage(): Promise<void> {
    const wc = this.activeWebContents;
    if (!wc) return;
    await wc.executeJavaScript(
      "(() => { const f=document.activeElement; if(f && f.form && f.tagName !== 'TEXTAREA') f.form.requestSubmit(); else if(f) f.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()",
      true,
    );
    this.closeKeyboard();
  }

  /** Live theme from the settings page; the chrome UI repaints from the next state broadcast. */
  previewTheme(theme: ShellState["theme"]): void {
    this.window.setBackgroundColor(theme.background);
    this.broadcast();
  }

  applyAdBlock(enabled: boolean): void {
    for (const tab of this.tabs.tabs) {
      if (enabled) this.deps.adblock.enable(tab.webContents.session);
      else this.deps.adblock.disable(tab.webContents.session);
    }
    if (enabled) this.deps.adblock.enable(session.defaultSession);
    else this.deps.adblock.disable(session.defaultSession);
    this.broadcast();
  }

  /** Settings that apply immediately; DNS-over-HTTPS needs a restart (host resolver is configured at start). */
  applyPrivacy(): void {
    this.httpAllowedHosts.clear();
    this.broadcast();
  }

  /** Navigation requested by an internal page (new tab tiles, error page retry, favorites/history rows). */
  navigateFromPage(tab: Tab, url: string, allowHttp: boolean): void {
    if (allowHttp) {
      const host = hostOf(url);
      if (host) this.httpAllowedHosts.add(host);
    }
    if (isWebUrl(url) || isInternal(url)) void this.tabs.load(tab, url);
    else this.searchOrNavigate(url);
  }

  toggleFavorite(): void {
    const tab = this.tabs.active;
    if (!tab || !isWebUrl(tab.url)) return;
    const result = toggleFavorite(this.deps.store.current, tab.url, tab.title);
    this.deps.store.save(result.settings);
    this.setStatus(result.isFavorite ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES");
    this.broadcast();
  }

  private refreshInputMode(): void {
    const tab = this.tabs.active;
    const host = tab ? hostOf(tab.url) : undefined;
    const s = this.deps.store.current;
    const mode: InputMode = !tab || isInternal(tab.url) ? "Spatial" : (host && s.siteInputModes[host]) || defaultModeFor(host, s.defaultInputMode);
    this.applyInputMode(mode, false);
  }

  private applyInputMode(mode: InputMode, announce: boolean): void {
    this.inputMode = mode;
    const wc = this.activeWebContents;
    if (wc) void this.cursor.show(wc, mode === "Cursor");
    if (announce) this.setStatus(`INPUT · ${mode.toUpperCase()}`);
  }

  cycleInputMode(): void {
    const next = nextMode(this.inputMode);
    const tab = this.tabs.active;
    const host = tab ? hostOf(tab.url) : undefined;
    if (host && tab && !isInternal(tab.url)) this.deps.store.update((s) => withInputMode(s, host, next));
    this.applyInputMode(next, true);
    this.broadcast();
  }

  private pageSize(): { width: number; height: number } {
    const bounds = this.tabs.active?.view.getBounds();
    return { width: bounds?.width ?? 0, height: bounds?.height ?? 0 };
  }

  async handle(command: ShellCommand): Promise<void> {
    const wc = this.activeWebContents;
    switch (command.type) {
      case "navigate": this.navigate(command.url, command.allowHttp); break;
      case "search-or-navigate": this.searchOrNavigate(command.text); break;
      case "back": if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case "forward": if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
      case "reload": wc?.reload(); break;
      case "home": this.navigate(this.deps.store.current.homeUrl); break;
      case "settings": this.navigate(Pages.settings); break;
      case "new-tab": this.newTab(command.isPrivate); break;
      case "close-tab": {
        const tab = command.id === undefined ? this.tabs.active : this.tabs.byId(command.id);
        if (tab) this.tabs.close(tab);
        if (this.tabs.tabs.length === 0) this.tabs.open(newTabTarget(this.deps.store.current));
        break;
      }
      case "activate-tab": { const tab = this.tabs.byId(command.id); if (tab) this.tabs.activate(tab); break; }
      case "switch-tab": this.tabs.switch(command.offset); break;
      case "reopen-tab": this.tabs.reopenClosed(); break;
      case "duplicate-tab": { const tab = this.tabs.byId(command.id); if (tab) this.tabs.open(tab.url, { isPrivate: tab.isPrivate }); break; }
      case "close-other-tabs": for (const t of [...this.tabs.tabs]) if (t.id !== command.id) this.tabs.close(t); break;
      case "mute-tab": {
        const tab = command.id === undefined ? this.tabs.active : this.tabs.byId(command.id);
        if (tab) { tab.webContents.setAudioMuted(!tab.isMuted); this.setStatus(tab.isMuted ? "TAB MUTED" : "TAB UNMUTED"); this.syncViews(); }
        break;
      }
      case "toggle-favorite": this.toggleFavorite(); break;
      case "permission": this.resolvePermission(command.allow, command.remember); break;
      case "window":
        if (command.action === "minimize") this.window.minimize();
        else if (command.action === "maximize") this.window.isMaximized() ? this.window.unmaximize() : this.window.maximize();
        else this.window.close();
        break;
      case "zoom": if (wc) { const z = command.delta === 0 ? 1 : Math.min(3, Math.max(0.5, wc.getZoomFactor() + command.delta)); wc.setZoomFactor(z); this.setStatus(`ZOOM ${Math.round(z * 100)}%`); } break;
      case "fullscreen-toggle": this.setChromeVisible(!this.chromeVisible); break;
      case "find":
        this.find = { text: command.text };
        if (wc && command.text) wc.findInPage(command.text, { forward: !command.backwards, findNext: true });
        this.broadcast();
        break;
      case "find-close": this.find = undefined; wc?.stopFindInPage("clearSelection"); this.broadcast(); break;
      case "keyboard-open": this.openKeyboard(command.target); break;
      case "keyboard-close": this.closeKeyboard(); wc?.focus(); break;
      case "keyboard-insert": if (this.keyboard?.target === "page") await this.insertIntoPage(command.text); break;
      case "keyboard-backspace": if (this.keyboard?.target === "page") await this.insertIntoPage(""); break;
      case "keyboard-submit": if (this.keyboard?.target === "page") await this.submitPage(); break;
      case "address-input":
        this.suggestions = buildSuggestions(command.text, this.deps.store.current.favorites, this.deps.history.recent(500)).map((s) => ({ title: s.title, url: s.url }));
        this.broadcast();
        break;
      case "cycle-input-mode": this.cycleInputMode(); break;
      case "escape":
        if (this.pendingPermission) this.resolvePermission(false, false);
        else if (this.keyboard) this.closeKeyboard();
        else if (this.find) { this.find = undefined; wc?.stopFindInPage("clearSelection"); this.broadcast(); }
        else if (wc && !this.chromeVisible) await wc.executeJavaScript("document.exitFullscreen && document.exitFullscreen()", true).catch(() => undefined);
        break;
    }
  }

  private async handleController(input: ControllerEvent): Promise<void> {
    const wc = this.activeWebContents;
    switch (input.type) {
      case "connected":
        this.controllerConnected = input.connected;
        this.broadcast();
        break;
      case "direction":
        if (!wc) return;
        if (this.inputMode === "Spatial") await spatialMove(wc, input.direction);
        else if (this.inputMode === "Cursor") {
          const size = this.pageSize();
          const step = 24;
          await this.cursor.moveBy(wc, input.direction === "left" ? -step : input.direction === "right" ? step : 0, input.direction === "up" ? -step : input.direction === "down" ? step : 0, size.width, size.height);
        } else sendArrow(wc, input.direction);
        break;
      case "activate":
        if (!wc) return;
        if (this.inputMode === "Cursor") this.cursor.click(wc);
        else if (this.inputMode === "Spatial") await spatialActivate(wc);
        else sendKey(wc, "Return");
        break;
      case "cursor-move":
        if (wc && this.inputMode === "Cursor") { const size = this.pageSize(); await this.cursor.moveBy(wc, input.dx, input.dy, size.width, size.height); }
        break;
      case "cursor-click": if (wc && this.inputMode === "Cursor") this.cursor.click(wc); break;
      case "scroll": if (wc) this.cursor.scroll(wc, input.notches); break;
    }
  }

  private handleShortcut(event: Electron.Event, input: Electron.Input): void {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    let command: ShellCommand | undefined;
    if (key === "escape") command = { type: "escape" };
    else if (key === "f11") command = { type: "fullscreen-toggle" };
    else if (ctrl && key === "t") command = input.shift ? { type: "reopen-tab" } : { type: "new-tab" };
    else if (ctrl && key === "n" && input.shift) command = { type: "new-tab", isPrivate: true };
    else if (ctrl && key === "w") command = { type: "close-tab" };
    else if (ctrl && key === "tab") command = { type: "switch-tab", offset: input.shift ? -1 : 1 };
    else if (ctrl && key === ",") command = { type: "settings" };
    else if (ctrl && key === "d") command = { type: "toggle-favorite" };
    else if (ctrl && key === "r") command = { type: "reload" };
    else if (ctrl && key === "h") command = { type: "navigate", url: Pages.history };
    else if (ctrl && key === "b") command = { type: "navigate", url: Pages.favorites };
    else if (ctrl && key === "m") command = { type: "mute-tab" };
    else if (ctrl && (key === "=" || key === "+")) command = { type: "zoom", delta: 0.1 };
    else if (ctrl && key === "-") command = { type: "zoom", delta: -0.1 };
    else if (ctrl && key === "0") command = { type: "zoom", delta: 0 };
    if (command) {
      event.preventDefault();
      void this.handle(command);
    }
  }

  /** Attach the same shortcuts to a page's web contents. */
  attachShortcuts(wc: WebContents): void {
    wc.on("before-input-event", (event, input) => this.handleShortcut(event, input));
  }
}


