import { hostOf } from "./security";

/**
 * Streaming hosts that may ask for a rendition from the user agent. An entry covers its subdomains, and a host
 * belongs here only when a row in docs/DRM-UAS.md recorded a better rendition with the desktop agent.
 */
export const STREAMING_HOSTS: readonly string[] = [
  "netflix.com",
  "primevideo.com",
  "disneyplus.com",
  "max.com",
  "hulu.com",
  "paramountplus.com",
  "crunchyroll.com",
  "tv.apple.com",
  "globoplay.globo.com",
];

export interface UserAgentChoice {
  /** Chromium's own agent, without the TV marker: what a desktop browser sends. */
  desktop: string;
  /** The same agent with the TV marker appended. */
  tv: string;
  /** Whether a listed host gets the desktop agent. Off until a measurement shows a gain. */
  enabled: boolean;
}

/** Exact host or a subdomain of it. "netflix.com.evil.example" is neither and does not match. */
export function matchesHost(host: string | undefined, pattern: string): boolean {
  if (!host) return false;
  const name = host.toLowerCase().replace(/\.+$/, "");
  return name === pattern || name.endsWith(`.${pattern}`);
}

export function isStreamingHost(host: string | undefined): boolean {
  return STREAMING_HOSTS.some((pattern) => matchesHost(host, pattern));
}

/** The agent a tab loads `url` with: the desktop one only on a listed streaming host, and only when enabled. */
export function userAgentForUrl(url: string | undefined | null, choice: UserAgentChoice): string {
  return choice.enabled && isStreamingHost(hostOf(url)) ? choice.desktop : choice.tv;
}
