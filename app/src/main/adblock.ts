import { Request } from "@ghostery/adblocker";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Session } from "electron";
import type { TrackingLevel } from "../shared/settings";
import { trackerListsFor } from "../shared/trackerLists";

/**
 * Ad/tracker blocking through Ghostery's engine, using the same community lists uBlock Origin uses
 * (EasyList, EasyPrivacy, uBO filters). Which lists load depends on the tracking-prevention level (E8-03):
 * Basic blocks ads only, Balanced adds the tracking lists and Strict adds the social-widget list.
 * The engine is cached on disk per level, so start-up and a level change do not need the network.
 * Lists refresh in the background from the official CDN, so blocking stays current without an app release.
 */
export class AdBlock {
  private blocker: ElectronBlocker | undefined;
  private enabledOn = new Set<Session>();
  private level: TrackingLevel | undefined;
  /** Serialises loads, so a level change and the daily refresh can never swap each other's engine. */
  private queue: Promise<unknown> = Promise.resolve();

  status = "Not loaded";
  listsVersion: string | undefined;

  constructor(private readonly cacheDir: string, private readonly log: (message: string) => void = () => {}) {}

  get isReady(): boolean {
    return this.blocker !== undefined;
  }

  get currentLevel(): TrackingLevel | undefined {
    return this.level;
  }

  /** Loads the lists for `level`; throws when the engine cannot be built, so start-up can log it. */
  async load(level: TrackingLevel): Promise<void> {
    await this.enqueue(() => this.swapTo(level));
  }

  /** Applies a new level on the live sessions without a restart; a failure keeps the current engine. */
  async setLevel(level: TrackingLevel): Promise<void> {
    if (level === this.level && this.blocker) return;
    try {
      await this.enqueue(() => this.swapTo(level));
      this.log(`Ad-block ${this.status}`);
    } catch (error) {
      this.status = `${level}: lists unavailable (${error instanceof Error ? error.message : String(error)})`;
      this.log(`Ad-block ${this.status}`);
    }
  }

  /** Re-downloads the lists of the current level and swaps the engine in place; blocking stays current without an app release. */
  async refreshLists(): Promise<void> {
    await this.enqueue(async () => {
      // Read inside the queue: a level change requested just before this refresh must win.
      const level = this.level;
      if (!level) return;
      try {
        const fresh = await ElectronBlocker.fromLists(fetch, trackerListsFor(level));
        await fs.writeFile(this.cachePath(level), fresh.serialize());
        this.install(fresh);
        this.status = `${level}: lists refreshed ${new Date().toISOString().slice(0, 16)}Z`;
        this.log(`Ad-block ${this.status}`);
      } catch (error) {
        this.status = `${level}: list refresh failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
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

  private async swapTo(level: TrackingLevel): Promise<void> {
    this.install(await this.engineFor(level));
    this.level = level;
    this.status = `${level}: ${trackerListsFor(level).length} lists loaded`;
  }

  /** Swaps the engine on every session that had blocking on: the new lists apply to the next request. */
  private install(engine: ElectronBlocker): void {
    for (const session of this.enabledOn) this.blocker?.disableBlockingInSession(session);
    this.blocker = engine;
    for (const session of this.enabledOn) engine.enableBlockingInSession(session);
  }

  private cachePath(level: TrackingLevel): string {
    return join(this.cacheDir, `adblock-engine-${level.toLowerCase()}.bin`);
  }

  private async engineFor(level: TrackingLevel): Promise<ElectronBlocker> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const path = this.cachePath(level);
    // The cache used to hold one engine, which was the Balanced level: adopt it instead of re-downloading.
    if (level === "Balanced" && !(await fs.access(path).then(() => true, () => false))) {
      await fs.rename(join(this.cacheDir, "adblock-engine.bin"), path).catch(() => undefined);
    }
    return ElectronBlocker.fromLists(fetch, trackerListsFor(level), {}, {
      path,
      read: fs.readFile,
      write: fs.writeFile,
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function requestOf(url: string, sourceUrl: string) {
  return Request.fromRawDetails({ url, sourceUrl, type: "script" });
}
