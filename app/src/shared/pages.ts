/** Internal pages live behind the joychromium:// scheme, served from the bundled assets by the main process. */
export const SCHEME = "joychromium";

export const Pages = {
  settings: `${SCHEME}://settings`,
  welcome: `${SCHEME}://welcome`,
  newtab: `${SCHEME}://newtab`,
  error: `${SCHEME}://error`,
  favorites: `${SCHEME}://favorites`,
  history: `${SCHEME}://history`,
} as const;

export type InternalPage = keyof typeof Pages;

/** Which asset file backs an internal URL, or undefined for anything else. */
export function internalPageFile(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== `${SCHEME}:`) return undefined;
  const name = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
  return name in Pages ? `${name === "welcome" ? "onboarding" : name}.html` : undefined;
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
  const parsed = new URL(url);
  return `${SCHEME}://${parsed.hostname}${parsed.search && parsed.hostname === "error" ? "" : ""}`;
}
