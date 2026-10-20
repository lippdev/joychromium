import { app, shell } from "electron";
import { platformId } from "./platform";
import type { Log } from "./log";

/** Where the updater looks for the download page when it cannot install by itself. */
export const RELEASES_URL = "https://github.com/lippdev/joychromium/releases/latest";
/** Release metadata electron-builder publishes next to each build. */
const LATEST_MAC_YML = "https://github.com/lippdev/joychromium/releases/latest/download/latest-mac.yml";

/** Reads `version:` out of the published update metadata. */
export function versionFromUpdateYml(text: string): string | undefined {
  return /^version:\s*(\S+)\s*$/m.exec(text)?.[1];
}

/**
 * Self-update through electron-updater, fed by GitHub Releases. Checks in the background, downloads, installs on quit.
 * Versions the remote policy marks as broken are skipped. Does nothing when running unpackaged.
 *
 * macOS builds are not signed with a Developer ID (ADR-010), and Squirrel.Mac refuses to apply updates to an
 * unsigned bundle, so on macOS the updater only reports that a newer version exists and opens the release page.
 */
export class Updater {
  status = "Not checked yet";
  private downloaded = false;
  private updater: typeof import("electron-updater").autoUpdater | undefined;
  /** Set when a newer version exists but the app must update by hand. */
  manualUpdate: { version: string; url: string } | undefined;

  constructor(private readonly log: Log, private readonly blockedVersions: () => readonly string[]) {}

  private get installsItself(): boolean {
    return platformId() !== "darwin";
  }

  private get autoUpdater(): typeof import("electron-updater").autoUpdater | undefined {
    if (!app.isPackaged || !this.installsItself) return undefined;
    if (!this.updater) {
      const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = { info: (m) => this.log.info(`updater: ${String(m)}`), warn: (m) => this.log.warn(`updater: ${String(m)}`), error: (m) => this.log.error(`updater: ${String(m)}`), debug: () => undefined };
      autoUpdater.on("update-downloaded", (info) => {
        this.downloaded = true;
        this.status = `v${info.version} downloaded; installs when you close JoyChromium`;
      });
      this.updater = autoUpdater;
    }
    return this.updater;
  }

  /** Reads the published release metadata without touching the local install. */
  private async latestVersion(): Promise<string | undefined> {
    try {
      const response = await fetch(LATEST_MAC_YML, { cache: "no-store" });
      if (!response.ok) {
        this.status = `Update check failed: HTTP ${response.status}`;
        return undefined;
      }
      return versionFromUpdateYml(await response.text());
    } catch (error) {
      this.status = `Update check failed: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
  }

  async check(): Promise<void> {
    if (!app.isPackaged) {
      this.status = "Running unpackaged; self-update only works when installed";
      return;
    }
    const updater = this.autoUpdater;
    if (!updater) {
      const version = await this.latestVersion();
      if (!version || version === app.getVersion()) {
        this.status = `v${app.getVersion()} is up to date`;
        return;
      }
      if (this.blockedVersions().includes(version)) {
        this.status = `v${version} is blocked by policy; staying on v${app.getVersion()}`;
        return;
      }
      this.manualUpdate = { version, url: RELEASES_URL };
      this.status = `v${version} is available; download it from the release page`;
      return;
    }
    if (this.downloaded) return;
    try {
      const result = await updater.checkForUpdates();
      const version = result?.updateInfo.version;
      if (!version || version === app.getVersion()) {
        this.status = `v${app.getVersion()} is up to date`;
        return;
      }
      if (this.blockedVersions().includes(version)) {
        this.status = `v${version} is blocked by policy; staying on v${app.getVersion()}`;
        updater.autoDownload = false;
        return;
      }
      this.status = `v${version} available; downloading`;
    } catch (error) {
      this.status = `Update check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** Opens the release page for an update that cannot install itself. */
  async openDownloadPage(): Promise<void> {
    await shell.openExternal(this.manualUpdate?.url ?? RELEASES_URL);
  }
}
