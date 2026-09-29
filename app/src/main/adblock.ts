import { Request } from "@ghostery/adblocker";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Session } from "electron";

/**
 * Ad/tracker blocking through Ghostery's engine, using the same community lists uBlock Origin uses
 * (EasyList, EasyPrivacy, uBO filters). The engine is cached on disk so start-up does not need the network.
 * Lists refresh in the background from the official CDN, so blocking stays current without an app release.
 */
export class AdBlock {
  private blocker: ElectronBlocker | undefined;
  private enabledOn = new Set<Session>();

  status = "Not loaded";
  listsVersion: string | undefined;

  constructor(private readonly cacheDir: string, private readonly log: (message: string) => void = () => {}) {}

  get isReady(): boolean {
    return this.blocker !== undefined;
  }

  /** Loads the cached engine if present, otherwise downloads the prebuilt lists. */
  async load(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const cachePath = join(this.cacheDir, "adblock-engine.bin");
    this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cachePath,
      read: fs.readFile,
      write: fs.writeFile,
    });
    this.status = "engine loaded";
  }

  /** Re-downloads the lists and swaps the engine in place; blocking stays current without an app release. */
  async refreshLists(): Promise<void> {
    try {
      const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      await fs.writeFile(join(this.cacheDir, "adblock-engine.bin"), fresh.serialize());
      for (const ses of this.enabledOn) this.blocker?.disableBlockingInSession(ses);
      this.blocker = fresh;
      for (const ses of this.enabledOn) fresh.enableBlockingInSession(ses);
      this.status = `lists refreshed ${new Date().toISOString().slice(0, 16)}Z`;
      this.log(`Ad-block ${this.status}`);
    } catch (error) {
      this.status = `list refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  enable(session: Session): void {
    if (!this.blocker || this.enabledOn.has(session)) return;
    this.blocker.enableBlockingInSession(session);
    this.enabledOn.add(session);
  }

  disable(session: Session): void {
    if (!this.blocker || !this.enabledOn.has(session)) return;
    this.blocker.disableBlockingInSession(session);
    this.enabledOn.delete(session);
  }

  /** True when a request to this URL would be blocked; used by tests and diagnostics. */
  wouldBlock(url: string, sourceUrl = "https://example.com/"): boolean {
    if (!this.blocker) return false;
    const { match } = this.blocker.match(
      // The engine expects a request description; the helper builds one from a URL pair.
      requestOf(url, sourceUrl),
    );
    return match;
  }
}

function requestOf(url: string, sourceUrl: string) {
  return Request.fromRawDetails({ url, sourceUrl, type: "script" });
}
