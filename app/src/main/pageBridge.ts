import { Channels } from "../shared/ipc";
import { Pages } from "../shared/pages";
import {
  DEFAULT_SHORTCUTS, parseSearchEngine, parseShortcut, parseTheme, SEARCH_ENGINES, THEME_PRESETS, type AppSettings,
  withoutInputMode, withoutPermissions,
} from "../shared/settings";
import type { ShellDeps } from "./shell";
import type { Shell } from "./shell";
import type { Tab } from "./tabs";

type Message = Record<string, unknown> & { type?: string };

/** Handles {type, ...} messages from the internal pages (settings, onboarding, new tab, error, favorites, history). */
export class PageBridge {
  constructor(private readonly shell: Shell, private readonly deps: ShellDeps) {}

  private reply(tab: Tab, message: unknown): void {
    if (!tab.webContents.isDestroyed()) tab.webContents.send(Channels.pageReply, message);
  }

  private init(tab: Tab): void {
    const s = this.deps.store.current;
    this.reply(tab, {
      type: "init",
      theme: s.theme,
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
      passwordAutosave: s.passwordAutosave,
      autofill: s.autofill,
      blockDangerousDownloads: s.blockDangerousDownloads,
      sitePermissions: s.sitePermissions,
      defaultInputMode: s.defaultInputMode,
      siteInputModes: s.siteInputModes,
      runtimeVersion: process.versions.chrome,
      appVersion: this.deps.appVersion,
      appUpdate: this.deps.updateStatus(),
      adBlockVersion: this.deps.adblock.listsVersion,
      adBlockUpdate: this.deps.adblock.status,
      policy: this.deps.policy.status,
    });
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
        for (const key of ["httpsOnly", "passwordAutosave", "autofill", "blockDangerousDownloads"] as const) if (typeof m[key] === "boolean") patch[key] = m[key] as boolean;
        if (m.trackingPrevention === "Basic" || m.trackingPrevention === "Balanced" || m.trackingPrevention === "Strict") patch.trackingPrevention = m.trackingPrevention;
        if (m.dnsOverHttps === "Off" || m.dnsOverHttps === "Cloudflare" || m.dnsOverHttps === "Quad9" || m.dnsOverHttps === "Google") patch.dnsOverHttps = m.dnsOverHttps;
        store.update((s) => ({ ...s, ...patch }));
        this.shell.applyPrivacy();
        break;
      }
      case "permission-forget":
        if (typeof m.host === "string") store.update((s) => withoutPermissions(s, m.host as string));
        break;
      case "inputmode-default":
        if (m.inputMode === "Spatial" || m.inputMode === "Cursor" || m.inputMode === "Arrows") store.update((s) => ({ ...s, defaultInputMode: m.inputMode as AppSettings["defaultInputMode"] }));
        break;
      case "inputmode-forget":
        if (typeof m.host === "string") store.update((s) => withoutInputMode(s, (m.host as string).toLowerCase()));
        break;
      case "favorite-remove":
        if (typeof m.url === "string") store.update((s) => ({ ...s, favorites: s.favorites.filter((f) => f.url !== m.url) }));
        this.shell.broadcast();
        break;
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
        this.reply(tab, { type: "update-status", appUpdate: this.deps.updateStatus(), adBlockUpdate: this.deps.adblock.status, policy: this.deps.policy.status });
        break;
      case "export-diagnostics":
        try {
          this.reply(tab, { type: "diagnostics", path: await this.deps.exportDiagnostics() });
        } catch (error) {
          this.reply(tab, { type: "diagnostics", error: error instanceof Error ? error.message : String(error) });
        }
        break;
      case "clear-data":
        await tab.webContents.session.clearStorageData();
        await tab.webContents.session.clearCache();
        this.shell.setStatus("BROWSING DATA CLEARED");
        break;
      default:
        break;
    }
    if (current !== store.current) this.shell.broadcast();
  }
}
