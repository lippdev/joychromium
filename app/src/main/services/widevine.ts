import type { Log } from "../log";

/**
 * Widevine support comes from the castLabs Electron for Content Security build shipped with the app (ADR-009).
 * It downloads the content decryption module on first run and keeps it updated afterwards. Stock Electron has no
 * `components` API, in which case DRM playback is simply unavailable and everything else keeps working.
 */
interface ComponentsApi {
  whenReady(): Promise<void>;
  status(): { widevine: string; ffmpeg?: string };
}

export function componentsApi(): ComponentsApi | undefined {
  return (require("electron") as { components?: ComponentsApi }).components;
}

export async function prepareWidevine(log: Log): Promise<string> {
  const components = componentsApi();
  if (!components) return "not available in this build";
  try {
    await components.whenReady();
    const status = components.status();
    const widevine = status.widevine ?? "not installed yet";
    log.info(`Widevine ${widevine}`);
    return widevine;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Widevine unavailable: ${message}`);
    return `failed: ${message}`;
  }
}
