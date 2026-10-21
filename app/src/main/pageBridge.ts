import { Channels } from "../shared/ipc";
import { Pages } from "../shared/pages";
import {
  DEFAULT_SHORTCUTS, NEW_TAB_BACKGROUNDS, parseSearchEngine, parseShortcut, parseTheme, SEARCH_ENGINES, THEME_PRESETS, type AppSettings,
  withoutInputMode, withoutPermissions,
} from "../shared/settings";
import { currentShortcutMod } from "./platform";
import { dictionary } from "../shared/i18n";
import { clearBrowsingData } from "./services/privacy";
import type { ShellDeps } from "./shell";
import type { Shell } from "./shell";
import type { Tab } from "./tabs";
import { faviconHost, readFavicon } from "./favicons";

type Message = Record<string, unknown> & { type?: string };

/** Handles {type, ...} messages from the internal pages (settings, onboarding, new tab, error, favorites, history). */
export class PageBridge {
  constructor(private readonly shell: Shell, private readonly deps: ShellDeps) {}

  private reply(tab: Tab, message: unknown): void {
    if (!tab.webContents.isDestroyed()) tab.webContents.send(Channels.pageReply, message);
  }

  private init(tab: Tab): void {
    this.reply(tab, { type: "init", ...this.payloadFields() });
  }

  private payloadFields(): Record<string, unknown> {
    const s = this.deps.store.current;
    return {
      theme: s.theme,
      faviconKey: this.deps.favicons.key,
      presets: THEME_PRESETS,
      searchEngine: s.searchEngine,
      searchEngines: SEARCH_ENGINES,
      adBlockEnabled: s.adBlockEnabled,
      adBlockAvailable: this.deps.adblock.isReady,
      path: this.deps.store.settingsPath,
      startup: s.startup,
      startupUrl: s.startupUrl,
      newTab: s.newTab,
      newTabUrl: s.newTabUrl,
      homeUrl: s.homeUrl,
      shortcuts: s.shortcuts,
      defaultShortcuts: DEFAULT_SHORTCUTS,
      favorites: s.favorites,
      httpsOnly: s.httpsOnly,
      trackingPrevention: s.trackingPrevention,
      dnsOverHttps: s.dnsOverHttps,
      blockDangerousDownloads: s.blockDangerousDownloads,
      sitePermissions: s.sitePermissions,
      defaultInputMode: s.defaultInputMode,
      siteInputModes: s.siteInputModes,
      controllerConnected: this.shell.controllerConnected,
      controllerFamily: this.shell.controllerFamily,
      runtimeVersion: process.versions.chrome,
      widevine: globalThis.joy?.widevine,
      shortcutMod: currentShortcutMod(),
      dictionary: dictionary(s.language),
      language: s.language,
      uiScale: s.uiScale,
      overscan: s.overscan,
      highContrast: s.highContrast,
      crashReports: s.crashReports,
      streamingDesktopUa: s.streamingDesktopUa,
      newTabBackground: s.newTabBackground,
      newTabSites: s.newTabSites,
      vibration: s.vibration,
      appVersion: this.deps.appVersion,
      appUpdate: this.deps.updateStatus(),
      updateUrl: this.deps.updateUrl(),
      updateInstall: this.deps.canInstallUpdate(),
      adBlockVersion: this.deps.adblock.listsVersion,
      adBlockUpdate: this.deps.adblock.status,
      policy: this.deps.policy.status,
    };
  }

  /** Hosts whose /favicon.ico gave no icon, and when: not asked again for a while, so a dropped connection does not decide it for good. */
  private readonly noFavicon = new Map<string, number>();

  /** The icon of a site the new tab lists but the app never saw load: /favicon.ico, once, through the asking tab's session. */
  private async fetchFavicon(tab: Tab, host: string): Promise<boolean> {
    if (faviconHost(`https://${host}/`) !== host) return false;
    if (this.deps.favicons.has(host)) return true;
    if (Date.now() - (this.noFavicon.get(host) ?? -Infinity) < 10 * 60_000) return false;
    const icon = await readFavicon(`https://${host}/favicon.ico`, (input, init) => tab.session.fetch(input, init));
    if (!icon) {
      this.noFavicon.set(host, Date.now());
      return false;
    }
    this.deps.favicons.put(host, icon, !tab.isPrivate);
    return true;
  }

  async handle(tab: Tab, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== "object") return;
    const m = raw as Message;
    const store = this.deps.store;
    const current = store.current;
    switch (m.type) {
      case "ready":
        this.init(tab);
        break;
      case "theme-preview": {
        const theme = parseTheme(m.theme);
        if (theme) { this.shell.previewTheme(theme); }
        break;
      }
      case "theme-save": {
        const theme = parseTheme(m.theme);
        if (theme) { store.update((s) => ({ ...s, theme })); this.shell.previewTheme(theme); }
        break;
      }
      case "search-save": {
        const engine = parseSearchEngine(m.searchEngine);
        if (engine) store.update((s) => ({ ...s, searchEngine: engine }));
        break;
      }
      case "adblock-save":
        if (typeof m.adBlockEnabled === "boolean") {
          store.update((s) => ({ ...s, adBlockEnabled: m.adBlockEnabled as boolean }));
          this.shell.applyAdBlock(m.adBlockEnabled);
        }
        break;
      case "onboarding-done":
        store.update((s) => ({ ...s, onboardingCompleted: true }));
        this.shell.navigate(Pages.newtab);
        break;
      case "general-save": {
        const patch: Partial<AppSettings> = {};
        if (m.startup === "NewTab" || m.startup === "Home" || m.startup === "Restore" || m.startup === "Custom") patch.startup = m.startup;
        if (m.newTab === "NewTabPage" || m.newTab === "Home" || m.newTab === "Custom") patch.newTab = m.newTab;
        for (const key of ["startupUrl", "newTabUrl", "homeUrl"] as const) {
          const value = m[key];
          if (typeof value === "string" && /^https?:\/\//i.test(value)) patch[key] = value;
        }
        store.update((s) => ({ ...s, ...patch }));
        break;
      }
      case "shortcuts-save":
        if (Array.isArray(m.shortcuts)) {
          const shortcuts = m.shortcuts.map(parseShortcut).filter((s): s is NonNullable<typeof s> => s !== undefined);
          store.update((s) => ({ ...s, shortcuts }));
        }
        break;
      case "privacy-save": {
        const patch: Partial<AppSettings> = {};
        for (const key of ["httpsOnly", "blockDangerousDownloads", "streamingDesktopUa"] as const) if (typeof m[key] === "boolean") patch[key] = m[key] as boolean;
        if (m.trackingPrevention === "Basic" || m.trackingPrevention === "Balanced" || m.trackingPrevention === "Strict") patch.trackingPrevention = m.trackingPrevention;
        if (m.dnsOverHttps === "Off" || m.dnsOverHttps === "Cloudflare" || m.dnsOverHttps === "Quad9" || m.dnsOverHttps === "Google") patch.dnsOverHttps = m.dnsOverHttps;
        store.update((s) => ({ ...s, ...patch }));
        await this.shell.applyPrivacy();
        // Names the level and list count that actually loaded, next to the toggle that was just saved.
        this.reply(tab, { type: "adblock-status", adBlockUpdate: this.deps.adblock.status });
        break;
      }
      case "permission-forget":
        if (typeof m.host === "string") store.update((s) => withoutPermissions(s, m.host as string));
        break;
      case "ui-settings": {
        const patch: Partial<AppSettings> = {};
        if (typeof m.uiScale === "number" && [0.8, 1, 1.25, 1.5].includes(m.uiScale)) patch.uiScale = m.uiScale;
        if (typeof m.overscan === "number" && m.overscan >= 0 && m.overscan <= 8) patch.overscan = m.overscan;
        if (typeof m.highContrast === "boolean") patch.highContrast = m.highContrast;
        if (m.language === "pt-BR" || m.language === "en") patch.language = m.language;
        if (typeof m.crashReports === "boolean") patch.crashReports = m.crashReports;
        if ((NEW_TAB_BACKGROUNDS as readonly unknown[]).includes(m.newTabBackground)) patch.newTabBackground = m.newTabBackground as AppSettings["newTabBackground"];
        if (typeof m.newTabSites === "boolean") patch.newTabSites = m.newTabSites;
        store.update((s) => ({ ...s, ...patch }));
        this.shell.broadcast();
        this.reply(tab, { type: "init", ...this.payloadFields() });
        break;
      }
      case "inputmode-default":
        if (m.inputMode === "Spatial" || m.inputMode === "Cursor" || m.inputMode === "Arrows") store.update((s) => ({ ...s, defaultInputMode: m.inputMode as AppSettings["defaultInputMode"] }));
        break;
      case "vibration-save":
        if (typeof m.vibration === "boolean") store.update((s) => ({ ...s, vibration: m.vibration as boolean }));
        break;
      case "inputmode-forget":
        if (typeof m.host === "string") store.update((s) => withoutInputMode(s, (m.host as string).toLowerCase()));
        break;
      case "favorite-remove":
        if (typeof m.url === "string") store.update((s) => ({ ...s, favorites: s.favorites.filter((f) => f.url !== m.url) }));
        this.shell.broadcast();
        break;
      case "favicon-fetch": {
        const hosts = Array.isArray(m.hosts) ? m.hosts.slice(0, 8).filter((h): h is string => typeof h === "string") : [];
        const found = await Promise.all(hosts.map((host) => this.fetchFavicon(tab, host)));
        const arrived = hosts.filter((_, i) => found[i]);
        if (arrived.length > 0) this.reply(tab, { type: "favicons", hosts: arrived });
        break;
      }
      case "history-search":
        this.reply(tab, { type: "history", entries: this.deps.history.search(typeof m.query === "string" ? m.query : "") });
        break;
      case "history-remove":
        if (typeof m.url === "string") this.deps.history.remove(m.url);
        break;
      case "history-clear":
        this.deps.history.clear();
        break;
      case "navigate":
        if (typeof m.url === "string" && m.url.trim()) this.shell.navigateFromPage(tab, m.url, m.allowHttp === true);
        break;
      case "update-check":
        await this.deps.checkUpdates();
        this.reply(tab, {
          type: "update-status", appUpdate: this.deps.updateStatus(), updateUrl: this.deps.updateUrl(),
          updateInstall: this.deps.canInstallUpdate(), adBlockUpdate: this.deps.adblock.status, policy: this.deps.policy.status,
        });
        break;
      case "update-install":
        // Falls back to the release page when the download is not there (an AppImage, a mac build, nothing downloaded).
        if (!this.deps.installUpdate()) await this.deps.openUpdatePage();
        break;
      case "update-download":
        await this.deps.openUpdatePage();
        break;
      case "export-diagnostics":
        try {
          this.reply(tab, { type: "diagnostics", path: await this.deps.exportDiagnostics() });
        } catch (error) {
          this.reply(tab, { type: "diagnostics", error: error instanceof Error ? error.message : String(error) });
        }
        break;
      case "clear-data":
        await clearBrowsingData({ session: tab.webContents.session, clearHistory: () => { this.deps.history.clear(); this.deps.favicons.clear(); } });
        this.shell.notify("browsingDataCleared");
        break;
      default:
        break;
    }
    if (current !== store.current) this.shell.broadcast();
  }
}
