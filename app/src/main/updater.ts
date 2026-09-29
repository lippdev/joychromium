import { app } from "electron";
import type { Log } from "./log";

/**
 * Self-update through electron-updater, fed by GitHub Releases. Checks in the background, downloads, installs on quit.
 * Versions the remote policy marks as broken are skipped. Does nothing when running unpackaged.
 */
export class Updater {
  status = "Not checked yet";
  private downloaded = false;
  private updater: typeof import("electron-updater").autoUpdater | undefined;

  constructor(private readonly log: Log, private readonly blockedVersions: () => readonly string[]) {}

  private get autoUpdater(): typeof import("electron-updater").autoUpdater | undefined {
    if (!app.isPackaged) return undefined;
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

  async check(): Promise<void> {
    const updater = this.autoUpdater;
    if (!updater) {
      this.status = "Running unpackaged; self-update only works when installed";
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

  applyOnExit(): void {
    // electron-updater installs automatically on quit when autoInstallOnAppQuit is set; nothing else to do.
  }
}
