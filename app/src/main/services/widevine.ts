import type { Log } from "../log";

/**
 * Widevine support comes from the castLabs Electron for Content Security build shipped with the app (ADR-009).
 * It downloads the content decryption module in the background and keeps it updated afterwards. Stock Electron has no
 * `components` API, in which case DRM playback is simply unavailable and everything else keeps working.
 */
interface ComponentState {
  status: string;
  title?: string;
  version?: string;
}

interface ComponentsApi {
  whenReady(): Promise<void>;
  status(): Record<string, ComponentState | undefined>;
}

/** Chromium's component id for the Widevine CDM. */
const WIDEVINE_COMPONENT = "oimompecagnajdejgnnjijobebaeigek";

/** How long to keep checking for the CDM before telling the user it is not there yet. */
const WAIT_MS = 30_000;
const CHECK_MS = 2_000;

export function componentsApi(): ComponentsApi | undefined {
  return (require("electron") as { components?: ComponentsApi }).components;
}

/** The installed CDM version, or undefined while the component is still missing. */
export function widevineVersion(status: Record<string, ComponentState | undefined>): string | undefined {
  return status[WIDEVINE_COMPONENT]?.version;
}

/**
 * Reports the CDM status to `report` as soon as it is known and again when the background download finishes. It never
 * blocks startup: the first callback may say "not installed yet" and the next one brings the version.
 */
export async function watchWidevine(log: Log, report: (status: string) => void): Promise<void> {
  const components = componentsApi();
  if (!components) {
    report("not available in this build");
    return;
  }
  try {
    await components.whenReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Widevine unavailable: ${message}`);
    report(`failed: ${message}`);
    return;
  }
  const deadline = Date.now() + WAIT_MS;
  let last = "";
  for (;;) {
    const version = widevineVersion(components.status());
    const status = version ? version : "not installed yet";
    if (status !== last) {
      log.info(`Widevine ${status}`);
      report(status);
      last = status;
    }
    if (version || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, CHECK_MS));
  }
}
