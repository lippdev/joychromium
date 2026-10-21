import { session, WebContentsView, type Session, type WebContents } from "electron";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { displayUrl, errorPageFor, isInternal, isWebUrl, Pages } from "../shared/pages";
import { hostOf, isHttp, isNavigationAllowed, upgradeToHttps } from "../shared/security";
import type { TabState } from "../shared/ipc";
import type { StatusId } from "../shared/status";

export interface TabEnvironment {
  preloadDir: string;
  httpsOnly: () => boolean;
  httpAllowedHosts: Set<string>;
  hostBlocked: (host: string | undefined) => boolean;
  /** The agent a tab loads a URL with: the desktop one on a listed streaming host, the TV one elsewhere. */
  userAgentFor: (url: string) => string;
  prepareSession: (ses: Session) => void;
  log: { info: (m: string) => void; warn: (m: string) => void; error: (m: string, e?: unknown) => void };
}

/** How long an inactive tab keeps its process before it is parked. */
export const SLEEP_AFTER_MS = 10 * 60_000;

/** One tab: a WebContentsView plus the state the shell shows for it. The view is recreated when a sleeping tab wakes. */
export class Tab {
  private viewRef: WebContentsView;
  title = "New tab";
  url = "";
  favicon: string | undefined;
  isPlayingAudio = false;
  isLoading = false;
  lastActive = Date.now();
  /** Parked: the process is gone and only the URL and title are kept. */
  sleeping = false;
  /** Original http URL while an automatic https upgrade is in flight, so a failure can offer the fallback. */
  pendingHttpsUpgrade: string | undefined;
  /** The navigation queue of this tab: every request waits for the one before it to settle, so the newest wins. */
  pendingLoad: Promise<void> | undefined;
  /** True while a navigation this shell started is still on its way to committing, so the next one can cancel it. */
  loadingNavigation = false;

  constructor(readonly id: number, readonly isPrivate: boolean, private readonly ses: Session, private readonly preload: string) {
    this.viewRef = Tab.createView(ses, preload);
  }

  private static createView(ses: Session, preload: string): WebContentsView {
    const view = new WebContentsView({
      // nodeIntegrationInSubFrames is what runs the preload in every frame, which is how the spatial script reaches an
      // embedded player. Node itself stays off; a sandboxed preload only gets the electron module.
      webPreferences: {
        session: ses, preload, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true,
        backgroundThrottling: true,
      },
    });
    view.setBackgroundColor("#1C1C1C");
    return view;
  }

  get view(): WebContentsView {
    return this.viewRef;
  }

  get webContents(): WebContents {
    return this.viewRef.webContents;
  }

  /** Drops the renderer process; the URL and title stay so the tab can be restored on demand. */
  sleep(): boolean {
    if (this.sleeping) return false;
    this.isLoading = false;
    this.isPlayingAudio = false;
    this.pendingLoad = undefined;
    this.loadingNavigation = false;
    this.viewRef.webContents.close();
    this.sleeping = true;
    return true;
  }

  /** Recreates the view for a parked tab and returns it, or undefined when the tab was awake already. */
  wake(): WebContentsView | undefined {
    if (!this.sleeping) return undefined;
    this.viewRef = Tab.createView(this.ses, this.preload);
    this.sleeping = false;
    this.lastActive = Date.now();
    return this.viewRef;
  }

  get isMuted(): boolean {
    return this.webContents.audioMuted;
  }

  snapshot(isActive: boolean): TabState {
    return {
      id: this.id,
      title: (this.isPrivate ? "🕶 " : "") + this.title,
      url: this.url,
      isActive,
      isPrivate: this.isPrivate,
      isPlayingAudio: this.isPlayingAudio,
      isMuted: this.isMuted,
      favicon: this.favicon,
      isLoading: this.isLoading,
      sleeping: this.sleeping,
    };
  }
}

export interface TabEvents {
  changed: [];
  status: [message: { id: StatusId; detail?: string }];
  fullscreen: [tab: Tab, on: boolean];
  visited: [url: string, title: string];
  popup: [url: string, from: Tab];
}

/** Owns every tab's WebContentsView and the per-page security hooks. Layout is the shell's job. */
export class TabManager extends EventEmitter<TabEvents> {
  readonly tabs: Tab[] = [];
  active: Tab | undefined;
  private nextId = 1;
  private readonly closed: { url: string; isPrivate: boolean }[] = [];

  constructor(private readonly env: TabEnvironment) {
    super();
    this.env.prepareSession(session.defaultSession);
  }

  get activeWebContents(): WebContents | undefined {
    return this.active?.webContents;
  }

  open(url: string, options: { activate?: boolean; isPrivate?: boolean } = {}): Tab {
    const isPrivate = options.isPrivate ?? false;
    const ses = isPrivate ? session.fromPartition(`private-${this.nextId}`) : session.defaultSession;
    if (isPrivate) this.env.prepareSession(ses);
    const tab = new Tab(this.nextId++, isPrivate, ses, join(this.env.preloadDir, "web.js"));
    tab.url = url;
    this.tabs.push(tab);
    this.wire(tab);
    if (options.activate ?? true) this.activate(tab);
    void this.load(tab, url);
    this.emit("changed");
    return tab;
  }

  activate(tab: Tab): void {
    if (this.active === tab) return;
    this.active = tab;
    tab.lastActive = Date.now();
    const view = tab.wake();
    if (view) {
      this.wire(tab);
      void this.load(tab, tab.url);
    }
    this.emit("changed");
  }

  /**
   * Parks every inactive tab that has been idle for `idleMs` and is not playing audio, so a TV box with a dozen
   * tabs open does not keep a dozen Chromium processes alive. Returns how many tabs went to sleep.
   */
  enforceSleep(now = Date.now(), idleMs = SLEEP_AFTER_MS): number {
    let slept = 0;
    for (const tab of this.tabs) {
      if (tab === this.active || tab.sleeping || tab.isPlayingAudio) continue;
      if (now - tab.lastActive < idleMs) continue;
      if (tab.sleep()) slept++;
    }
    if (slept > 0) this.emit("changed");
    return slept;
  }

  close(tab: Tab): void {
    const index = this.tabs.indexOf(tab);
    if (index < 0) return;
    this.tabs.splice(index, 1);
    if (isWebUrl(tab.url)) this.closed.push({ url: tab.url, isPrivate: tab.isPrivate });
    if (this.active === tab) {
      this.active = undefined;
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (next) this.activate(next);
    }
    if (!tab.sleeping) tab.webContents.close();
    this.emit("changed");
  }

  reopenClosed(): Tab | undefined {
    const last = this.closed.pop();
    return last ? this.open(last.url, { isPrivate: last.isPrivate }) : undefined;
  }

  switch(offset: number): void {
    if (!this.active || this.tabs.length < 2) return;
    const index = (this.tabs.indexOf(this.active) + offset + this.tabs.length) % this.tabs.length;
    this.activate(this.tabs[index]!);
  }

  byId(id: number): Tab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  /** Navigates a tab, applying the allow-list and the https-only upgrade before the request leaves. */
  async load(tab: Tab, url: string): Promise<void> {
    if (!isNavigationAllowed(url)) {
      this.emit("status", { id: "blockedScheme" });
      return;
    }
    const host = hostOf(url);
    if (this.env.hostBlocked(host)) {
      this.emit("status", { id: "blockedHost", detail: host });
      return;
    }
    let target = url;
    if (this.env.httpsOnly() && isHttp(url) && host && !this.env.httpAllowedHosts.has(host)) {
      tab.pendingHttpsUpgrade = url;
      target = upgradeToHttps(url)!;
    }
    // Requests queue behind the one in flight: did-start-navigation only arrives a tick after loadURL, so a second
    // navigation would otherwise start while the first is still being served and the internal page could commit last.
    const previous = tab.pendingLoad;
    const run = (async () => {
      if (previous) {
        if (tab.loadingNavigation) await this.cancel(tab);
        await previous;
      }
      tab.loadingNavigation = true;
      try {
        // Set per document, so a streaming host gets the desktop agent and every other tab keeps the TV identity.
        tab.webContents.setUserAgent(this.env.userAgentFor(target));
        await tab.webContents.loadURL(target);
      } catch (error) {
        // did-fail-load handles the user-visible part; loadURL rejects for the same failures.
        this.env.log.warn(`loadURL(${target}) rejected: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        tab.loadingNavigation = false;
      }
    })();
    tab.pendingLoad = run;
    try {
      await run;
    } finally {
      if (tab.pendingLoad === run) tab.pendingLoad = undefined;
    }
  }

  /**
   * Cancels the navigation in flight and waits for Chromium to unwind it. Starting the next navigation on top of an
   * aborted one leaves the frame half-torn-down, where running a script in the page's world never answers.
   */
  private async cancel(tab: Tab): Promise<void> {
    const wc = tab.webContents;
    await new Promise<void>((resolve) => {
      const done = (): void => {
        wc.off("did-stop-loading", done);
        wc.off("did-fail-load", done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 1500);
      wc.once("did-stop-loading", done);
      wc.once("did-fail-load", done);
      wc.stop();
    });
  }

  snapshot(): TabState[] {
    return this.tabs.map((t) => t.snapshot(t === this.active));
  }

  sessionUrls(): string[] {
    return this.tabs
      .filter((t) => !t.isPrivate)
      .map((t) => t.url)
      .filter((u) => u !== Pages.welcome && u !== Pages.settings && !u.startsWith(Pages.error));
  }

  private wire(tab: Tab): void {
    const wc = tab.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      this.emit("popup", url, tab);
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      if (!isNavigationAllowed(url)) {
        event.preventDefault();
        this.emit("status", { id: "blockedScheme" });
        return;
      }
      const host = hostOf(url);
      if (this.env.hostBlocked(host)) {
        event.preventDefault();
        this.emit("status", { id: "blockedHost", detail: host });
        return;
      }
      // A link to another site switches the agent for the destination. The switch cancels the navigation in flight,
      // so when the agent has to change the shell loads the destination itself, the way it does for an https upgrade.
      const upgrade = this.env.httpsOnly() && isHttp(url) && host && !this.env.httpAllowedHosts.has(host) ? upgradeToHttps(url)! : undefined;
      const target = upgrade ?? url;
      const agent = this.env.userAgentFor(target);
      if (agent !== wc.getUserAgent()) {
        event.preventDefault();
        if (upgrade) tab.pendingHttpsUpgrade = url;
        wc.setUserAgent(agent);
        void wc.loadURL(target);
        return;
      }
      if (upgrade) {
        event.preventDefault();
        tab.pendingHttpsUpgrade = url;
        void wc.loadURL(upgrade);
      }
    });
    wc.on("did-start-navigation", (details) => {
      if (!details.isMainFrame) return;
      tab.url = displayUrl(details.url);
      tab.isLoading = true;
      this.emit("changed");
    });
    wc.on("did-finish-load", () => {
      tab.isLoading = false;
      tab.pendingHttpsUpgrade = undefined;
      tab.url = displayUrl(wc.getURL());
      if (!tab.isPrivate && isWebUrl(wc.getURL()) && !isInternal(wc.getURL())) this.emit("visited", wc.getURL(), wc.getTitle());
      this.emit("changed");
    });
    wc.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      tab.isLoading = false;
      // -3 = ABORTED: a navigation replaced by a newer one; browsers show nothing for it.
      if (code === -3) return;
      const pendingHttp = tab.pendingHttpsUpgrade;
      tab.pendingHttpsUpgrade = undefined;
      if (isInternal(url)) return;
      void wc.loadURL(errorPageFor(pendingHttp ?? url, description || String(code), pendingHttp !== undefined));
    });
    wc.on("page-title-updated", (_event, title) => {
      tab.title = title || tab.title;
      if (!tab.isPrivate && isWebUrl(wc.getURL()) && !isInternal(wc.getURL())) this.emit("visited", wc.getURL(), title);
      this.emit("changed");
    });
    wc.on("page-favicon-updated", (_event, favicons) => {
      tab.favicon = favicons.find((f) => f.startsWith("https://")) ?? favicons[0];
      this.emit("changed");
    });
    wc.on("media-started-playing", () => {
      tab.isPlayingAudio = true;
      this.emit("changed");
    });
    wc.on("media-paused", () => {
      tab.isPlayingAudio = false;
      this.emit("changed");
    });
    wc.on("audio-state-changed", () => this.emit("changed"));
    wc.on("enter-html-full-screen", () => this.emit("fullscreen", tab, true));
    wc.on("leave-html-full-screen", () => this.emit("fullscreen", tab, false));
    wc.on("render-process-gone", (_event, details) => {
      this.env.log.error(`Renderer gone for ${tab.url}: ${details.reason} (${details.exitCode})`);
      if (details.reason === "killed" || details.reason === "clean-exit") return;
      this.emit("status", { id: "pageCrashed" });
      void this.load(tab, tab.url || Pages.newtab);
    });
    wc.on("unresponsive", () => this.emit("status", { id: "pageUnresponsive" }));
    wc.on("responsive", () => this.emit("status", { id: "pageResponsive" }));
  }
}
