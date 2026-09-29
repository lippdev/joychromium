import { isWebUrl, Pages } from "./pages";

export interface Theme {
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export const DEFAULT_THEME: Theme = { accent: "#64DDB5", background: "#0C0E13", surface: "#14171E", text: "#F3F5F9" };

export const THEME_PRESETS: Record<string, Theme> = {
  Mint: DEFAULT_THEME,
  Ocean: { accent: "#4CC2FF", background: "#0B1220", surface: "#121C2E", text: "#EAF2FF" },
  Ember: { accent: "#FF7A45", background: "#15100E", surface: "#1F1815", text: "#FFF1EA" },
  Violet: { accent: "#B388FF", background: "#100D18", surface: "#191424", text: "#F2EDFF" },
  Light: { accent: "#0F7B6C", background: "#F4F6FA", surface: "#FFFFFF", text: "#111418" },
};

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

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { name: "YouTube TV", url: "https://www.youtube.com/tv" },
  { name: "Twitch", url: "https://www.twitch.tv" },
  { name: "Netflix", url: "https://www.netflix.com" },
  { name: "Prime Video", url: "https://www.primevideo.com" },
  { name: "Disney+", url: "https://www.disneyplus.com" },
  { name: "Spotify", url: "https://open.spotify.com" },
];

export function parseShortcut(value: unknown): Shortcut | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  return typeof s.name === "string" && s.name.trim() && isWebUrl(s.url) ? { name: s.name.trim(), url: s.url.trim() } : undefined;
}

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
  passwordAutosave: boolean;
  autofill: boolean;
  blockDangerousDownloads: boolean;
  /** host -> permission kind -> allowed */
  sitePermissions: Record<string, Record<string, boolean>>;
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
    passwordAutosave: false,
    autofill: false,
    blockDangerousDownloads: true,
    sitePermissions: {},
  };
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const webUrl = (value: unknown, fallback: string): string => (isWebUrl(value as string) ? (value as string) : fallback);

/** Lenient parse: every field is optional and validated independently; anything invalid falls back to the default. */
export function parseSettings(raw: unknown): AppSettings {
  const d = defaultSettings();
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
    theme: parseTheme(r.theme) ?? d.theme,
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
    passwordAutosave: bool(r.passwordAutosave, d.passwordAutosave),
    autofill: bool(r.autofill, d.autofill),
    blockDangerousDownloads: bool(r.blockDangerousDownloads, d.blockDangerousDownloads),
    sitePermissions: permissions,
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
