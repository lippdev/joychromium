/** Internal pages live behind the joychromium:// scheme, served from the bundled assets by the main process. */
export const SCHEME = "joychromium";

export const Pages = {
  settings: `${SCHEME}://settings`,
  welcome: `${SCHEME}://welcome`,
  newtab: `${SCHEME}://newtab`,
  error: `${SCHEME}://error`,
  favorites: `${SCHEME}://favorites`,
  history: `${SCHEME}://history`,
  design: `${SCHEME}://design`,
} as const;

export type InternalPage = keyof typeof Pages;

/** Pages that belong to the development tooling and are never served from a packaged build. */
const DEV_ONLY_PAGES: ReadonlySet<string> = new Set<InternalPage>(["design"]);

/** Asset files behind those pages, so an explicit file path cannot reach them either. */
const DEV_ONLY_FILES: ReadonlySet<string> = new Set(["design.html"]);

/** Which asset file backs an internal URL, or undefined for anything else. */
export function internalPageFile(url: string, allowDevOnly = true): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== `${SCHEME}:`) return undefined;
  const name = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
  if (!(name in Pages)) return undefined;
  if (!allowDevOnly && DEV_ONLY_PAGES.has(name)) return undefined;
  return `${name === "welcome" ? "onboarding" : name}.html`;
}

/** Whether a path names an asset of a development-only page, whatever separators it uses. */
export function isDevOnlyFile(path: string): boolean {
  return DEV_ONLY_FILES.has(path.split(/[\\/]/).pop() ?? "");
}

export function isInternal(url: string): boolean {
  return internalPageFile(url) !== undefined;
}

export function isWebUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function errorPageFor(url: string, reason: string, upgraded: boolean): string {
  const params = new URLSearchParams({ url, reason, upgraded: upgraded ? "1" : "0" });
  return `${Pages.error}/?${params.toString()}`;
}

/** Display form of a URL: internal pages show their short scheme form, everything else as-is. */
export function displayUrl(url: string): string {
  const file = internalPageFile(url);
  if (!file) return url;
  return `${SCHEME}://${new URL(url).hostname}`;
}
