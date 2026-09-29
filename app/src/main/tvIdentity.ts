/** The user-agent marker that tells sites this is a TV. Appended exactly once; malformed markers are refused. */
export const TV_MARKER = "JoyChromiumTV/1.0 (TV; SmartTV)";

const MARKER_PREFIX = "JoyChromiumTV/";

export function ensureTvIdentity(userAgent: string): string {
  if (!userAgent.trim()) throw new Error("User agent must not be empty.");
  if (isTvIdentityActive(userAgent)) return userAgent;
  if (userAgent.toLowerCase().includes(MARKER_PREFIX.toLowerCase())) {
    throw new Error("A malformed JoyChromium TV marker is already present.");
  }
  return `${userAgent} ${TV_MARKER}`;
}

export function isTvIdentityActive(userAgent: string): boolean {
  return userAgent.toLowerCase().includes(TV_MARKER.toLowerCase());
}
