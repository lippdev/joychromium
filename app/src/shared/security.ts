import { isInternal } from "./pages";
import type { DohProvider } from "./settings";

/** Pure security rules shared by the main process and the tests. */

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".msi", ".msix", ".appx", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh", ".scr", ".com", ".pif", ".cpl",
  ".dll", ".hta", ".jar", ".lnk", ".reg", ".inf", ".iso", ".img", ".vhd", ".sh", ".run", ".deb", ".rpm", ".appimage",
]);

/** Only web pages, our internal pages and about:blank may be navigated to. */
export function isNavigationAllowed(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url === "about:blank") return true;
  if (isInternal(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isHttp(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

/** The same URL over https, or undefined when it is not a plain http URL. */
export function upgradeToHttps(url: string | undefined | null): string | undefined {
  if (!isHttp(url)) return undefined;
  const parsed = new URL(url!);
  parsed.protocol = "https:";
  if (parsed.port === "80") parsed.port = "";
  return parsed.toString();
}

export function hostOf(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

export function isDangerousDownload(fileName: string | undefined | null, extra: readonly string[] = []): boolean {
  const ext = extensionOf(fileName ?? "");
  return DANGEROUS_EXTENSIONS.has(ext) || extra.some((e) => e.toLowerCase() === ext);
}

/** Strips path separators and reserved characters so a server-suggested name cannot escape the folder. */
export function safeFileName(suggested: string | undefined | null): string {
  const base = (suggested ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/^\.+$/, "");
  return cleaned.trim() || "download";
}

export const DOH_TEMPLATES: Record<Exclude<DohProvider, "Off">, string> = {
  Cloudflare: "https://cloudflare-dns.com/dns-query",
  Quad9: "https://dns.quad9.net/dns-query",
  Google: "https://dns.google/dns-query",
};

export function dohTemplate(provider: DohProvider): string | undefined {
  return provider === "Off" ? undefined : DOH_TEMPLATES[provider];
}

/** Allows at most `limit` popups within `windowMs`; older timestamps are pruned from `recent` in place. */
export function allowPopup(recent: number[], now: number, limit = 3, windowMs = 1000): boolean {
  for (let i = recent.length - 1; i >= 0; i--) if (now - recent[i]! > windowMs) recent.splice(i, 1);
  if (recent.length >= limit) return false;
  recent.push(now);
  return true;
}

/** Version strings are dotted numbers; true when `actual` is at least `minimum`. */
export function versionAtLeast(actual: string | undefined | null, minimum: string): boolean {
  const parse = (v: string | undefined | null): number[] | undefined => {
    if (!v || !/^\d+(\.\d+)*$/.test(v)) return undefined;
    return v.split(".").map(Number);
  };
  const a = parse(actual);
  const m = parse(minimum);
  if (!a || !m) return false;
  for (let i = 0; i < Math.max(a.length, m.length); i++) {
    const x = a[i] ?? 0;
    const y = m[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
