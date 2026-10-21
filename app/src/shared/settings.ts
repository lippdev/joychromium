import { isWebUrl, Pages } from "./pages";
import type { WindowMode } from "./platform";

export type Language = "pt-BR" | "en";
export const UI_SCALES = [0.8, 1, 1.25, 1.5] as const;

export interface Theme {
  accent: string;
  background: string;
  surface: string;
  text: string;
}

/** The logo's blue on Edge-like neutral greys: the background is the tab strip, the surface the toolbar. */
export const DEFAULT_THEME: Theme = { accent: "#2B95FF", background: "#1C1C1C", surface: "#2B2B2B", text: "#F3F3F3" };

const LIGHT_THEME: Theme = { accent: "#0067C0", background: "#E9EBEE", surface: "#F9F9F9", text: "#1B1B1B" };

export const THEME_PRESETS: Record<string, Theme> = {
  Joy: DEFAULT_THEME,
  Ocean: { accent: "#4CC2FF", background: "#0B1220", surface: "#121C2E", text: "#EAF2FF" },
  Ember: { accent: "#FF7A45", background: "#15100E", surface: "#1F1815", text: "#FFF1EA" },
  Violet: { accent: "#B388FF", background: "#100D18", surface: "#191424", text: "#F2EDFF" },
  Midnight: { accent: "#7AA2FF", background: "#0A0E1A", surface: "#131A2B", text: "#E6ECFF" },
  Graphite: { accent: "#A9B8D0", background: "#141414", surface: "#232323", text: "#EDEDED" },
  Rose: { accent: "#FF6B9A", background: "#160E12", surface: "#21161B", text: "#FFEFF4" },
  Sunset: { accent: "#FFB224", background: "#15110A", surface: "#201A10", text: "#FFF6E5" },
  Light: LIGHT_THEME,
};

/** The green presets the app shipped before the blue brand, mapped to what replaced them, so saved settings follow. */
const RETIRED_THEMES: Record<string, Theme> = {
  "#64DDB5|#0C0E13|#14171E|#F3F5F9": DEFAULT_THEME,
  "#0F7B6C|#F4F6FA|#FFFFFF|#111418": LIGHT_THEME,
};

export function migrateTheme(theme: Theme | undefined): Theme | undefined {
  return theme && (RETIRED_THEMES[[theme.accent, theme.background, theme.surface, theme.text].join("|")] ?? theme);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function parseTheme(value: unknown): Theme | undefined {
  if (!value || typeof value !== "object") return undefined;
  const t = value as Record<string, unknown>;
  return isHexColor(t.accent) && isHexColor(t.background) && isHexColor(t.surface) && isHexColor(t.text)
    ? { accent: t.accent.toUpperCase(), background: t.background.toUpperCase(), surface: t.surface.toUpperCase(), text: t.text.toUpperCase() }
    : undefined;
}

export interface SearchEngine {
  name: string;
  template: string;
}

export const GOOGLE: SearchEngine = { name: "Google", template: "https://www.google.com/search?q=%s" };

export const SEARCH_ENGINES: SearchEngine[] = [
  GOOGLE,
  { name: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s" },
  { name: "Bing", template: "https://www.bing.com/search?q=%s" },
  { name: "Brave", template: "https://search.brave.com/search?q=%s" },
  { name: "Startpage", template: "https://www.startpage.com/do/search?q=%s" },
];

export function isValidSearchTemplate(template: unknown): template is string {
  return typeof template === "string" && template.includes("%s") && isWebUrl(template.replace("%s", "q"));
}

export function parseSearchEngine(value: unknown): SearchEngine | undefined {
  if (!value || typeof value !== "object") return undefined;
  const e = value as Record<string, unknown>;
  if (!isValidSearchTemplate(e.template)) return undefined;
  const name = typeof e.name === "string" && e.name.trim() ? e.name.trim() : "Custom";
  return { name, template: e.template.trim() };
}

export function buildSearchUrl(engine: SearchEngine, text: string): string {
  return engine.template.replace("%s", encodeURIComponent(text));
}

export interface Shortcut {
  name: string;
  url: string;
}

/** The new tab shows only the user's own sites: no shortcut comes preinstalled. */
export const DEFAULT_SHORTCUTS: Shortcut[] = [];

/** The streaming shortcuts every install had before version 5, removed from settings that still hold them untouched. */
const RETIRED_SHORTCUT_URLS = [
  "https://www.youtube.com/tv", "https://www.twitch.tv", "https://www.netflix.com",
  "https://www.primevideo.com", "https://www.disneyplus.com", "https://open.spotify.com",
];

export function parseShortcut(value: unknown): Shortcut | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  return typeof s.name === "string" && s.name.trim() && isWebUrl(s.url) ? { name: s.name.trim(), url: s.url.trim() } : undefined;
}

/** What the new tab draws behind the logo and the search: the bundled wallpaper, the accent glow, or the plain color. */
export const NEW_TAB_BACKGROUNDS = ["Wallpaper", "Gradient", "Solid"] as const;
export type NewTabBackground = (typeof NEW_TAB_BACKGROUNDS)[number];

export type StartupMode = "NewTab" | "Home" | "Restore" | "Custom";
export type NewTabMode = "NewTabPage" | "Home" | "Custom";
export type TrackingLevel = "Basic" | "Balanced" | "Strict";
export type DohProvider = "Off" | "Cloudflare" | "Quad9" | "Google";
export type InputMode = "Spatial" | "Cursor" | "Arrows";

export const DEFAULT_HOME_URL = "https://www.youtube.com/tv";

export interface AppSettings {
  theme: Theme;
  searchEngine: SearchEngine;
  adBlockEnabled: boolean;
  onboardingCompleted: boolean;
  startup: StartupMode;
  startupUrl: string;
  newTab: NewTabMode;
  newTabUrl: string;
  homeUrl: string;
  shortcuts: Shortcut[];
  favorites: Shortcut[];
  defaultInputMode: InputMode;
  siteInputModes: Record<string, InputMode>;
  httpsOnly: boolean;
  trackingPrevention: TrackingLevel;
  dnsOverHttps: DohProvider;
  blockDangerousDownloads: boolean;
  /** tv opens fullscreen for a controller; window is the desktop layout. */
  windowMode: WindowMode;
  /** UI scale for the viewing distance: 0.8 (dense), 1 (TV), 1.25, 1.5. */
  uiScale: number;
  /** Safe-area margin in percent of the screen, for TVs that crop the edges. */
  overscan: number;
  highContrast: boolean;
  language: Language;
  /** Sends crash reports so bugs get fixed. Off until the user says yes. */
  crashReports: boolean;
  /** Short haptic tap when A confirms and a double tap when something is blocked. Off until the user asks for it. */
  vibration: boolean;
  /** host -> permission kind -> allowed */
  sitePermissions: Record<string, Record<string, boolean>>;
  /**
   * Loads the streaming hosts in shared/streamingUa.ts with the desktop user agent instead of the TV one, for the
   * sites whose rendition improves without the TV marker. Off until a row in docs/DRM-UAS.md shows a gain.
   */
  streamingDesktopUa: boolean;
  newTabBackground: NewTabBackground;
  /** The row of quick-link tiles under the search on the new tab. */
  newTabSites: boolean;
}

export function defaultSettings(): AppSettings {
  return {
    theme: DEFAULT_THEME,
    searchEngine: GOOGLE,
    adBlockEnabled: true,
    onboardingCompleted: false,
    startup: "NewTab",
    startupUrl: DEFAULT_HOME_URL,
    newTab: "NewTabPage",
    newTabUrl: DEFAULT_HOME_URL,
    homeUrl: DEFAULT_HOME_URL,
    shortcuts: DEFAULT_SHORTCUTS,
    favorites: [],
    defaultInputMode: "Spatial",
    siteInputModes: {},
    httpsOnly: true,
    trackingPrevention: "Balanced",
    dnsOverHttps: "Off",
    blockDangerousDownloads: true,
    windowMode: "tv",
    uiScale: 1,
    overscan: 0,
    highContrast: false,
    language: "pt-BR",
    crashReports: false,
    vibration: false,
    sitePermissions: {},
    streamingDesktopUa: false,
    newTabBackground: "Wallpaper",
    newTabSites: true,
  };
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const webUrl = (value: unknown, fallback: string): string => (isWebUrl(value as string) ? (value as string) : fallback);

/** Bumped whenever a stored file needs a new shape; migrations below bring older files forward. */
export const SETTINGS_SCHEMA_VERSION = 5;

/**
 * Old versions this app wrote. The file is plain JSON with every field optional, so the only migrations needed are
 * the ones that change meaning rather than presence:
 *   1 -> 2  saved passwords and autofill were removed (they never had any effect); tracking prevention started
 *           being enforced, and its default became Balanced. Nothing to rewrite — parseSettings drops the dead keys.
 *   2 -> 3  the per-site streaming user agent was added, off for every profile until a measurement in
 *           docs/DRM-UAS.md justifies turning it on. Nothing to rewrite — a missing key parses as off.
 *   3 -> 4  haptic feedback arrived, off: an older file gets the switch written as false, so the living room stays
 *           quiet until someone turns it on.
 */
export function migrateSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const source = raw as Record<string, unknown>;
  const version = typeof source.schemaVersion === "number" ? source.schemaVersion : 1;
  const migrated: Record<string, unknown> = { ...source };
  if (version < 2) {
    delete migrated.passwordAutosave;
    delete migrated.autofill;
  }
  if (version < 4 && typeof migrated.vibration !== "boolean") migrated.vibration = false;
  // A list the user edited is theirs and stays; the untouched old defaults go.
  if (version < 5 && Array.isArray(migrated.shortcuts)
    && migrated.shortcuts.map((s) => (s as { url?: unknown })?.url).join("|") === RETIRED_SHORTCUT_URLS.join("|")) migrated.shortcuts = [];
  migrated.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return migrated;
}

/** Lenient parse: every field is optional and validated independently; anything invalid falls back to the default. */
export function parseSettings(input: unknown): AppSettings {
  const d = defaultSettings();
  const raw = migrateSettings(input);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const list = (value: unknown): Shortcut[] | undefined =>
    Array.isArray(value) ? value.map(parseShortcut).filter((s): s is Shortcut => s !== undefined) : undefined;
  const inputModes: Record<string, InputMode> = {};
  if (r.siteInputModes && typeof r.siteInputModes === "object") {
    for (const [host, mode] of Object.entries(r.siteInputModes as Record<string, unknown>)) {
      if (host.trim() && (mode === "Spatial" || mode === "Cursor" || mode === "Arrows")) inputModes[host.toLowerCase()] = mode;
    }
  }
  const permissions: Record<string, Record<string, boolean>> = {};
  if (r.sitePermissions && typeof r.sitePermissions === "object") {
    for (const [host, kinds] of Object.entries(r.sitePermissions as Record<string, unknown>)) {
      if (!host.trim() || !kinds || typeof kinds !== "object") continue;
      const clean: Record<string, boolean> = {};
      for (const [kind, allowed] of Object.entries(kinds as Record<string, unknown>)) if (typeof allowed === "boolean") clean[kind] = allowed;
      permissions[host.toLowerCase()] = clean;
    }
  }
  return {
    theme: migrateTheme(parseTheme(r.theme)) ?? d.theme,
    searchEngine: parseSearchEngine(r.searchEngine) ?? d.searchEngine,
    adBlockEnabled: bool(r.adBlockEnabled, d.adBlockEnabled),
    onboardingCompleted: bool(r.onboardingCompleted, d.onboardingCompleted),
    startup: oneOf(["NewTab", "Home", "Restore", "Custom"] as const, r.startup, d.startup),
    startupUrl: webUrl(r.startupUrl, d.startupUrl),
    newTab: oneOf(["NewTabPage", "Home", "Custom"] as const, r.newTab, d.newTab),
    newTabUrl: webUrl(r.newTabUrl, d.newTabUrl),
    homeUrl: webUrl(r.homeUrl, d.homeUrl),
    shortcuts: list(r.shortcuts) ?? d.shortcuts,
    favorites: list(r.favorites) ?? d.favorites,
    defaultInputMode: oneOf(["Spatial", "Cursor", "Arrows"] as const, r.defaultInputMode, d.defaultInputMode),
    siteInputModes: inputModes,
    httpsOnly: bool(r.httpsOnly, d.httpsOnly),
    trackingPrevention: oneOf(["Basic", "Balanced", "Strict"] as const, r.trackingPrevention, d.trackingPrevention),
    dnsOverHttps: oneOf(["Off", "Cloudflare", "Quad9", "Google"] as const, r.dnsOverHttps, d.dnsOverHttps),
    blockDangerousDownloads: bool(r.blockDangerousDownloads, d.blockDangerousDownloads),
    windowMode: oneOf(["tv", "window"] as const, r.windowMode, d.windowMode),
    uiScale: (UI_SCALES as readonly number[]).includes(Number(r.uiScale)) ? Number(r.uiScale) : d.uiScale,
    overscan: typeof r.overscan === "number" && r.overscan >= 0 && r.overscan <= 8 ? r.overscan : d.overscan,
    highContrast: bool(r.highContrast, d.highContrast),
    language: oneOf(["pt-BR", "en"] as const, r.language, d.language),
    crashReports: bool(r.crashReports, d.crashReports),
    vibration: bool(r.vibration, d.vibration),
    sitePermissions: permissions,
    streamingDesktopUa: bool(r.streamingDesktopUa, d.streamingDesktopUa),
    newTabBackground: oneOf(NEW_TAB_BACKGROUNDS, r.newTabBackground, d.newTabBackground),
    newTabSites: bool(r.newTabSites, d.newTabSites),
  };
}

/** URL a new tab should load. */
export function newTabTarget(s: AppSettings): string {
  switch (s.newTab) {
    case "Home":
      return s.homeUrl;
    case "Custom":
      return s.newTabUrl;
    default:
      return Pages.newtab;
  }
}

/** URLs to open at startup; more than one only when restoring a session. */
export function startupTargets(s: AppSettings, lastSession: readonly string[]): string[] {
  switch (s.startup) {
    case "Home":
      return [s.homeUrl];
    case "Custom":
      return [s.startupUrl];
    case "Restore":
      return lastSession.length > 0 ? [...lastSession] : [newTabTarget(s)];
    default:
      return [newTabTarget(s)];
  }
}

export function isFavorite(s: AppSettings, url: string): boolean {
  return s.favorites.some((f) => f.url === url);
}

/** Adds or removes a favorite; returns the new settings and whether the URL is now a favorite. */
export function toggleFavorite(s: AppSettings, url: string, name: string): { settings: AppSettings; isFavorite: boolean } {
  if (isFavorite(s, url)) return { settings: { ...s, favorites: s.favorites.filter((f) => f.url !== url) }, isFavorite: false };
  const shortcut = parseShortcut({ name, url }) ?? parseShortcut({ name: url, url });
  return shortcut ? { settings: { ...s, favorites: [...s.favorites, shortcut] }, isFavorite: true } : { settings: s, isFavorite: false };
}

export function withPermission(s: AppSettings, host: string, kind: string, allow: boolean): AppSettings {
  const site = { ...(s.sitePermissions[host] ?? {}), [kind]: allow };
  return { ...s, sitePermissions: { ...s.sitePermissions, [host]: site } };
}

export function withoutPermissions(s: AppSettings, host: string): AppSettings {
  const { [host]: _removed, ...rest } = s.sitePermissions;
  return { ...s, sitePermissions: rest };
}

export function withInputMode(s: AppSettings, host: string, mode: InputMode): AppSettings {
  return { ...s, siteInputModes: { ...s.siteInputModes, [host]: mode } };
}

export function withoutInputMode(s: AppSettings, host: string): AppSettings {
  const { [host]: _removed, ...rest } = s.siteInputModes;
  return { ...s, siteInputModes: rest };
}
