import { session, WebContentsView, type Session, type WebContents } from "electron";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { displayUrl, errorPageFor, isInternal, isWebUrl, Pages } from "../shared/pages";
import { hostOf, isHttp, isNavigationAllowed, upgradeToHttps } from "../shared/security";
import type { TabState } from "../shared/ipc";

export interface TabEnvironment {
  preloadDir: string;
  spatialScript: string;
  httpsOnly: () => boolean;
  httpAllowedHosts: Set<string>;
  hostBlocked: (host: string | undefined) => boolean;
  prepareSession: (ses: Session) => void;
  log: { info: (m: string) => void; warn: (m: string) => void; error: (m: string, e?: unknown) => void };
}

/** One tab: a WebContentsView plus the state the shell shows for it. */
export class Tab {
  readonly view: WebContentsView;
  title = "New tab";
  url = "";
  favicon: string | undefined;
  isPlayingAudio = false;
  isLoading = false;
  lastActive = Date.now();
  /** Original http URL while an automatic https upgrade is in flight, so a failure can offer the fallback. */
  pendingHttpsUpgrade: string | undefined;

  constructor(readonly id: number, readonly isPrivate: boolean, ses: Session, preload: string) {
    this.view = new WebContentsView({
      webPreferences: { session: ses, preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: true },
    });
    this.view.setBackgroundColor("#0C0E13");
  }

  get webContents(): WebContents {
    return this.view.webContents;
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
    };
  }
}

export interface TabEvents {
  changed: [];
  status: [text: string];
  fullscreen: [tab: Tab, on: boolean];
  focusin: [tab: Tab];
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
    this.emit("changed");
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
    tab.webContents.close();
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
      this.emit("status", "BLOCKED · UNSUPPORTED ADDRESS");
      return;
    }
    const host = hostOf(url);
    if (this.env.hostBlocked(host)) {
      this.emit("status", `BLOCKED BY POLICY · ${host}`);
      return;
    }
    let target = url;
    if (this.env.httpsOnly() && isHttp(url) && host && !this.env.httpAllowedHosts.has(host)) {
      tab.pendingHttpsUpgrade = url;
      target = upgradeToHttps(url)!;
    }
    try {
      await tab.webContents.loadURL(target);
    } catch (error) {
      // did-fail-load handles the user-visible part; loadURL rejects for the same failures.
      this.env.log.warn(`loadURL(${target}) rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        this.emit("status", "BLOCKED · UNSUPPORTED ADDRESS");
        return;
      }
      const host = hostOf(url);
      if (this.env.hostBlocked(host)) {
        event.preventDefault();
        this.emit("status", `BLOCKED BY POLICY · ${host}`);
        return;
      }
      if (this.env.httpsOnly() && isHttp(url) && host && !this.env.httpAllowedHosts.has(host)) {
        event.preventDefault();
        tab.pendingHttpsUpgrade = url;
        void wc.loadURL(upgradeToHttps(url)!);
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
    wc.on("dom-ready", () => {
      // Same script the WebView2 shell injected: spatial focus navigation plus the virtual cursor overlay.
      if (!isInternal(wc.getURL())) wc.executeJavaScript(this.env.spatialScript, true).catch(() => undefined);
    });
    wc.on("render-process-gone", (_event, details) => {
      this.env.log.error(`Renderer gone for ${tab.url}: ${details.reason} (${details.exitCode})`);
      if (details.reason === "killed" || details.reason === "clean-exit") return;
      this.emit("status", "PAGE CRASHED · RELOADING");
      void this.load(tab, tab.url || Pages.newtab);
    });
    wc.on("unresponsive", () => this.emit("status", "PAGE NOT RESPONDING · B TO GO BACK, X TO RELOAD"));
    wc.on("responsive", () => this.emit("status", "PAGE RESPONDING AGAIN"));
  }
}
