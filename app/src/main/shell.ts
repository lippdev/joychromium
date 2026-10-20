import { BrowserWindow, ipcMain, powerSaveBlocker, session, type Session, type WebContents } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Channels, type ControllerEvent, type PermissionPrompt, type ShellActivity, type ShellCommand, type ShellPreferences, type ShellState } from "../shared/ipc";
import { diffShellState } from "../shared/statePatch";
import { displayUrl, isInternal, isWebUrl, Pages } from "../shared/pages";
import type { WindowMode } from "../shared/platform";
import { hostOf, isDangerousDownload, isThirdPartyRequest, allowPopup, safeFileName, trackingPolicy } from "../shared/security";
import { commandForShortcut } from "../shared/shortcuts";
import { userAgentForUrl } from "../shared/streamingUa";
import { CommandRouter } from "./services/commandRouter";
import { WindowLayout } from "./services/layout";
import { InputRouter } from "./services/inputRouter";
import { Navigation } from "./services/navigation";
import { isShellCommand } from "../shared/commands";
import { isFavorite, toggleFavorite, withInputMode, withPermission, type InputMode } from "../shared/settings";
import { defaultModeFor, nextMode } from "../shared/controllerInput";
import type { AdBlock } from "./adblock";
import { VirtualCursor } from "./controllerActions";
import type { History } from "./history";
import type { Log } from "./log";
import { PageBridge } from "./pageBridge";
import type { PolicyService } from "./policyService";
import type { SettingsStore } from "./store";
import { browserWindowOptions, currentShortcutMod, downloadsFolder, nativeWindowControls, platformDangerousExtensions } from "./platform";
import { decideDownload, downloadStatus } from "./services/downloads";
import { insertIntoPage, submitPage } from "./services/keyboard";
import { describePermission, permissionNeedsPrompt, PermissionQueue } from "./services/permissions";
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
  /** Chrome's agent without the TV marker, and the same agent with it, for the per-site streaming rule. */
  desktopUserAgent: string;
  tvUserAgent: string;
  updateStatus: () => string;
  checkUpdates: () => Promise<void>;
  updateUrl: () => string | undefined;
  /** A downloaded deb/rpm waiting for the user to restart, on installs where the package manager asks for the password. */
  canInstallUpdate: () => boolean;
  installUpdate: () => boolean;
  openUpdatePage: () => Promise<void>;
  exportDiagnostics: () => Promise<string>;
}


/** The browser window: shell UI on the window's own web contents, one WebContentsView per tab laid out beneath the chrome. */
export class Shell {
  readonly window: BrowserWindow;
  readonly tabs: TabManager;
  private readonly layout: WindowLayout;
  chromeVisible = true;
  inputMode: InputMode = "Spatial";
  keyboard: ShellState["keyboard"];
  find: ShellState["find"];
  suggestions: ShellState["suggestions"] = [];
  private statusText = "STARTING · TV IDENTITY ON";
  controllerConnected = false;
  controllerFamily: ShellState["controllerFamily"] = "generic";
  readonly permissions = new PermissionQueue();
  private readonly httpAllowedHosts = new Set<string>();
  private readonly recentPopups: number[] = [];
  readonly cursor = new VirtualCursor();
  private sleepBlocker: number | undefined;
  private readonly bridge: PageBridge;
  private readonly router: CommandRouter;
  private readonly controller: InputRouter;
  private readonly navigation: Navigation;
  private lastSavedSession = "";
  private chromeHideTimer: NodeJS.Timeout | undefined;
  /** True once the chrome UI is listening; until then a broadcast has nowhere to land. */
  private chromeReady = false;
  /** The state the chrome UI already has; undefined until it asks for the first full snapshot. */
  private sentState: ShellState | undefined;
  /** The shell left fullscreen to minimize a TV-mode window, and restores it when the window comes back. */
  private returnToFullScreen = false;

  constructor(private readonly deps: ShellDeps) {
    this.window = new BrowserWindow(browserWindowOptions(deps.store.current.theme.background, join(deps.distDir, "preload", "chrome.js")));
    this.tabs = new TabManager({
      preloadDir: join(deps.distDir, "preload"),
      httpsOnly: () => deps.store.current.httpsOnly,
      httpAllowedHosts: this.httpAllowedHosts,
      hostBlocked: (host) => deps.policy.current.blockedHosts.some((b) => host === b || host?.endsWith(`.${b}`) === true),
      userAgentFor: (url) =>
        userAgentForUrl(url, { desktop: deps.desktopUserAgent, tv: deps.tvUserAgent, enabled: deps.store.current.streamingDesktopUa }),
      prepareSession: (ses) => this.prepareSession(ses),
      log: deps.log,
    });
    this.bridge = new PageBridge(this, deps);
    this.router = new CommandRouter(this);
    this.layout = new WindowLayout(this);
    this.controller = new InputRouter(this, this.cursor);
    this.navigation = new Navigation({
      tabs: this.tabs,
      settings: () => this.deps.store.current,
      httpAllowedHosts: this.httpAllowedHosts,
      openKeyboard: (target) => this.openKeyboard(target),
      closeKeyboard: () => this.closeKeyboard(),
    });
    this.wireTabs();
    this.wireWindow();
    this.wireIpc();
  }

  // ---- Lifecycle ----

  async start(targets: readonly string[]): Promise<void> {
    await this.window.loadURL("joychromium://chrome/");
    this.applyWindowMode(this.deps.store.current.windowMode, false);
    this.window.show();
    targets.forEach((url, i) => this.tabs.open(url, { activate: i === 0 }));
    setInterval(() => this.housekeeping(), 30_000).unref();
    setInterval(() => this.tabs.enforceSleep(), 60_000).unref();
  }

  get activeTab(): Tab | undefined {
    return this.tabs.active;
  }

  get activeWebContents(): WebContents | undefined {
    return this.tabs.activeWebContents;
  }

  status(text: string): void {
    this.statusText = text;
    this.broadcast();
  }

  setStatus(text: string): void {
    this.status(text);
  }

  get store(): SettingsStore { return this.deps.store; }
  get history(): History { return this.deps.history; }

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
    this.wireTracking(ses);
  }

  private readonly trackingWired = new WeakSet<Session>();

  /** Reads the live tracking level, so a settings change applies without reinstalling the hooks. */
  private wireTracking(ses: Session): void {
    if (this.trackingWired.has(ses)) return;
    this.trackingWired.add(ses);
    const filter = { urls: ["http://*/*", "https://*/*"] };
    const policy = () => trackingPolicy(this.deps.store.current.trackingPrevention);
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const headers = { ...details.requestHeaders };
      const current = policy();
      if (current.sendGpc) {
        headers.DNT = "1";
        headers["Sec-GPC"] = "1";
      }
      if (current.blockThirdPartyCookies && isThirdPartyRequest(details.url, details.referrer)) {
        delete headers.Cookie;
        delete headers.cookie;
      }
      callback({ requestHeaders: headers });
    });
    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
      if (!policy().blockThirdPartyCookies || !isThirdPartyRequest(details.url, details.referrer)) {
        callback({});
        return;
      }
      const responseHeaders = { ...details.responseHeaders };
      for (const key of Object.keys(responseHeaders)) if (key.toLowerCase() === "set-cookie") delete responseHeaders[key];
      callback({ responseHeaders });
    });
  }

  private async decidePermission(kind: string, url: string): Promise<boolean> {
    const host = hostOf(url);
    if (!host || isInternal(url)) return false;
    if (!permissionNeedsPrompt(kind)) return true;
    const remembered = this.deps.store.current.sitePermissions[host]?.[kind];
    if (remembered !== undefined) return remembered;
    const wait = this.permissions.ask({ host, kind, description: describePermission(kind) });
    // Only one prompt at a time; anything that piles up behind it is denied for this request.
    if (!wait) return false;
    this.broadcast();
    return wait;
  }

  resolvePermission(allow: boolean, remember: boolean): void {
    const settled = this.permissions.settle(allow);
    if (!settled) return;
    if (remember) this.deps.store.update((s) => withPermission(s, settled.host, settled.kind, allow));
    this.broadcast();
  }

  private handleDownload(item: Electron.DownloadItem): void {
    const decision = decideDownload(item.getFilename(), {
      folder: downloadsFolder(),
      blockDangerous: this.deps.store.current.blockDangerousDownloads,
      extraDangerous: [...platformDangerousExtensions(), ...this.deps.policy.current.extraDangerousExtensions],
    });
    if (decision.action === "block") {
      item.cancel();
      this.setStatus(`DOWNLOAD BLOCKED · ${decision.name}`);
      return;
    }
    const name = safeFileName(item.getFilename());
    mkdirSync(downloadsFolder(), { recursive: true });
    item.setSavePath(decision.path);
    item.on("updated", () => this.setStatus(downloadStatus(name, item.getReceivedBytes(), item.getTotalBytes())));
    item.once("done", (_event, state) => this.setStatus(state === "completed" ? `DOWNLOADED · ${name}` : `DOWNLOAD ${state.toUpperCase()} · ${name}`));
  }

  // ---- Tabs and layout ----

  private wireTabs(): void {
    this.tabs.on("changed", () => { this.syncViews(); this.scheduleChromeHide(); });
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
    this.window.on("resize", () => this.layout.apply());
    this.window.on("maximize", () => this.layout.apply());
    this.window.on("unmaximize", () => this.layout.apply());
    const onActivity = (): void => this.broadcastActivity();
    this.window.on("minimize", onActivity);
    this.window.on("show", onActivity);
    this.window.on("hide", onActivity);
    this.window.on("restore", () => {
      // TV mode comes back the way it went: fullscreen, and only when the shell left it to minimize.
      if (this.returnToFullScreen) {
        this.returnToFullScreen = false;
        this.window.setFullScreen(true);
      }
      this.broadcastActivity();
    });
    this.window.on("close", () => this.deps.store.saveSession(this.tabs.sessionUrls()));
    this.window.webContents.on("before-input-event", (event, input) => this.handleShortcut(event, input));
    // The UI is gone or reloading: nothing can apply a patch until it asks for a fresh snapshot again.
    this.window.webContents.on("did-start-loading", () => this.forgetChrome());
    this.window.webContents.on("render-process-gone", (_event, details) => {
      this.forgetChrome();
      this.deps.log.error(`Shell UI renderer gone: ${details.reason}`);
    });
  }

  private readonly wired = new WeakSet<WebContents>();

  syncViews(): void {
    const contentView = this.window.contentView;
    for (const tab of this.tabs.tabs) {
      // A sleeping tab has no live view: its process is gone until the tab is activated again.
      if (tab.sleeping) continue;
      if (!this.wired.has(tab.webContents)) {
        this.wired.add(tab.webContents);
        this.attachShortcuts(tab.webContents);
      }
      if (!contentView.children.includes(tab.view)) contentView.addChildView(tab.view);
      tab.view.setVisible(tab === this.tabs.active);
    }
    for (const child of contentView.children) {
      if (child instanceof Object && !this.tabs.tabs.some((t) => !t.sleeping && t.view === child)) contentView.removeChildView(child);
    }
    this.layout.apply();
    this.refreshInputMode();
    this.updateKeepAwake();
    this.broadcast();
  }

  setLayout(top: number, bottom: number): void {
    this.layout.setInsets(top, bottom);
  }

  setChromeVisible(visible: boolean): void {
    if (!visible) clearTimeout(this.chromeHideTimer);
    this.layout.setChromeVisible(visible, () => this.deps.store.current.windowMode === "tv");
    this.layout.apply();
    this.broadcast();
  }

  applyWindowMode(mode: WindowMode, persist: boolean): void {
    if (persist) this.deps.store.update((s) => ({ ...s, windowMode: mode }));
    this.layout.applyMode(this.deps.store.current.windowMode === "tv");
    this.broadcast();
  }

  /**
   * Leaves fullscreen before minimizing and comes back to it on restore (E4-03). A fullscreen window is not
   * minimizable on Linux — the window manager ignores the request, nothing is reported to the page, and the shell keeps
   * reading the controller for a window nobody can see.
   */
  minimizeWindow(): void {
    this.returnToFullScreen = this.window.isFullScreen();
    if (this.returnToFullScreen) this.window.setFullScreen(false);
    this.window.minimize();
  }

  /** A second launch focuses this window instead of opening another copy of the profile. */
  focusFromSecondInstance(url?: string): void {
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
    if (url) this.navigate(url);
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

  /**
   * Sends only what changed since the UI last heard from us: the whole state for a UI that just started, a patch of
   * the changed areas after that (E3-03). Nothing goes out before the UI announces itself, so a patch can never land
   * on top of a snapshot that never arrived.
   */
  broadcast(): void {
    if (!this.chromeReady || this.window.isDestroyed()) return;
    const state = this.snapshot();
    if (!this.sentState) {
      this.window.webContents.send(Channels.shellState, state);
    } else {
      const patch = diffShellState(this.sentState, state);
      if (patch) this.window.webContents.send(Channels.shellPatch, patch);
    }
    this.sentState = state;
  }

  /**
   * Tells the UI whether the window is on screen (E4-03). A frameless window keeps its renderer "visible" while the
   * window manager has it minimized, so the shell cannot learn this from the document and an idle controller loop
   * would keep running; the main process is the one that knows.
   */
  private broadcastActivity(): void {
    if (!this.chromeReady || this.window.isDestroyed()) return;
    const activity: ShellActivity = { active: !this.window.isMinimized() && this.window.isVisible() };
    this.window.webContents.send(Channels.shellActivity, activity);
  }

  private forgetChrome(): void {
    this.chromeReady = false;
    this.sentState = undefined;
  }

  private snapshot(): ShellState {
    const s = this.deps.store.current;
    const active = this.tabs.active;
    const state: ShellState = {
      tabs: this.tabs.snapshot(),
      activeUrl: active?.url ?? "",
      isFavorite: active ? isFavorite(s, active.url) : false,
      inputMode: this.inputMode,
      adBlock: this.deps.adblock.isReady && s.adBlockEnabled,
      controllerConnected: this.controllerConnected,
      controllerFamily: this.controllerFamily,
      chromeVisible: this.chromeVisible,
      permission: this.permissions.prompt,
      theme: s.theme,
      status: this.statusText,
      keyboard: this.keyboard,
      find: this.find,
      suggestions: this.suggestions,
      shortcutMod: currentShortcutMod(),
      nativeWindowControls: nativeWindowControls(),
      windowMode: s.windowMode,
      uiScale: s.uiScale,
      overscan: s.overscan,
      highContrast: s.highContrast,
      language: s.language,
      crashReports: s.crashReports,
    };
    return state;
  }

  // ---- Commands from the chrome UI ----

  private wireIpc(): void {
    // The chrome UI registers its listeners first, then asks for the snapshot that starts the patch stream.
    ipcMain.on(Channels.shellReady, (event) => {
      if (event.sender !== this.window.webContents) return;
      this.chromeReady = true;
      this.sentState = undefined;
      this.broadcast();
      this.broadcastActivity();
    });
    ipcMain.on(Channels.shellCommand, (event, command: unknown) => {
      if (event.sender !== this.window.webContents) return;
      if (!isShellCommand(command)) {
        this.deps.log.warn(`Refused a malformed command: ${JSON.stringify(command)?.slice(0, 200)}`);
        return;
      }
      void this.handle(command).catch((error) => this.deps.log.error(`Command ${command.type} failed`, error));
    });
    ipcMain.on(Channels.controller, (event, input: ControllerEvent) => {
      if (event.sender !== this.window.webContents) return;
      void this.handleController(input).catch((error) => this.deps.log.error(`Controller ${input.type} failed`, error));
    });
    ipcMain.on(Channels.pageFocusIn, (event) => {
      if (this.tabs.active && event.sender === this.tabs.active.webContents) this.openKeyboard("page");
    });
    // Every frame of a tab asks for the script with its own preload; the page cannot call this channel itself.
    ipcMain.handle(Channels.spatialScript, (event) => {
      return this.tabs.tabs.some((t) => t.webContents === event.sender) ? this.deps.spatialScript : undefined;
    });
    ipcMain.on(Channels.pageMessage, (event, message: unknown) => {
      const tab = this.tabs.tabs.find((t) => t.webContents === event.sender);
      if (tab) void this.bridge.handle(tab, message).catch((error) => this.deps.log.error("Page message failed", error));
    });
    ipcMain.on(Channels.shellLayout, (event, top: number, bottom: number) => {
      if (event.sender === this.window.webContents) this.setLayout(top, bottom);
    });
    ipcMain.handle(Channels.shellThumbnails, async (event) => {
      if (event.sender !== this.window.webContents) return [];
      const shots = await Promise.all(this.tabs.tabs.map(async (tab) => {
        if (tab.sleeping) return { id: tab.id, dataUrl: "" };
        try {
          const image = await tab.webContents.capturePage();
          return { id: tab.id, dataUrl: image.isEmpty() ? "" : image.resize({ width: 480 }).toDataURL() };
        } catch {
          return { id: tab.id, dataUrl: "" };
        }
      }));
      return shots;
    });
    ipcMain.handle(Channels.shellPreferences, (event): ShellPreferences => {
      if (event.sender !== this.window.webContents) return { vibration: false };
      return { vibration: this.deps.store.current.vibration };
    });
  }

  navigate(url: string, allowHttp = false): void {
    this.navigation.go(url, allowHttp);
  }

  searchOrNavigate(text: string): void {
    this.navigation.searchOrGo(text);
  }

  newTab(isPrivate = false): void {
    this.navigation.newTab(isPrivate);
  }

  openKeyboard(target: "address" | "page"): void {
    this.revealChrome();
    this.keyboard = { target, title: target === "address" ? "ADDRESS / SEARCH" : "PAGE TEXT ENTRY" };
    this.broadcast();
  }

  closeKeyboard(): void {
    if (!this.keyboard) return;
    this.keyboard = undefined;
    this.suggestions = [];
    this.broadcast();
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

  /**
   * Settings that apply immediately: the tracking level swaps the block lists on the live sessions.
   * DNS-over-HTTPS needs a restart (the host resolver is configured at start).
   */
  async applyPrivacy(): Promise<void> {
    this.httpAllowedHosts.clear();
    await this.deps.adblock.setLevel(this.deps.store.current.trackingPrevention);
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

  refreshInputMode(): void {
    const tab = this.tabs.active;
    const host = tab ? hostOf(tab.url) : undefined;
    const s = this.deps.store.current;
    const mode: InputMode = !tab || isInternal(tab.url) ? "Spatial" : (host && s.siteInputModes[host]) || defaultModeFor(host, s.defaultInputMode);
    this.applyInputMode(mode, false);
  }

  applyInputMode(mode: InputMode, announce: boolean): void {
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

  isPlayingMedia(): boolean {
    return this.tabs.active?.isPlayingAudio ?? false;
  }

  pageSize(): { width: number; height: number } {
    const bounds = this.tabs.active?.view.getBounds();
    return { width: bounds?.width ?? 0, height: bounds?.height ?? 0 };
  }

  async handle(command: ShellCommand): Promise<void> {
    // The bar comes back for anything the user asked for, except the renderer reporting its own height.
    if (command.type !== "chrome-height") this.revealChrome();
    await this.router.run(command);
  }

  /** Shows the bar and arms the timer that hides it again while a web page has the screen. */
  revealChrome(): void {
    if (!this.chromeVisible) this.setChromeVisible(true);
    this.scheduleChromeHide();
  }

  private scheduleChromeHide(): void {
    clearTimeout(this.chromeHideTimer);
    if (this.deps.store.current.windowMode !== "tv") return;
    const tab = this.tabs.active;
    if (!tab || tab.sleeping || isInternal(tab.url)) return;
    this.chromeHideTimer = setTimeout(() => {
      if (this.deps.store.current.windowMode === "tv" && !this.permissions.prompt && !this.keyboard) this.setChromeVisible(false);
    }, 4_000);
    this.chromeHideTimer.unref?.();
  }

  async handleController(input: ControllerEvent): Promise<void> {
    await this.controller.run(input);
  }

  setControllerConnected(connected: boolean, family?: ShellState["controllerFamily"]): void {
    this.controllerConnected = connected;
    if (family) this.controllerFamily = family;
    this.publishControllerState();
    this.broadcast();
  }

  /**
   * The onboarding page used to poll `navigator.getGamepads` from the tab renderer, which duplicates the one poll the
   * shell already runs and can miss the pad when the tab is not the focused renderer. The shell owns the input, so it
   * tells the internal pages what it knows.
   */
  private publishControllerState(): void {
    for (const tab of this.tabs.tabs) {
      if (tab.sleeping || !isInternal(tab.url)) continue;
      tab.webContents.send(Channels.pageReply, { type: "controller", connected: this.controllerConnected, family: this.controllerFamily });
    }
  }

  private handleShortcut(event: Electron.Event, input: Electron.Input): void {
    const command = commandForShortcut(input, Pages.history, Pages.favorites);
    if (!command) return;
    event.preventDefault();
    void this.handle(command);
  }

  /** Attach the same shortcuts to a page's web contents. */
  attachShortcuts(wc: WebContents): void {
    wc.on("before-input-event", (event, input) => this.handleShortcut(event, input));
  }
}


