import { app, shell } from "electron";
import { currentUpdateInstaller, installsUpdatesWithPackageManager, platformId } from "./platform";
import { followsPrereleases, installsAtLaunch } from "../shared/updates";
import type { Log } from "./log";

/** Where the updater looks for the download page when it cannot install by itself. */
export const RELEASES_URL = "https://github.com/lippdev/joychromium/releases/latest";
/** The whole release list, which is where a pre-1.0 build has to look: `latest` never points at a pre-release. */
export const RELEASES_PAGE_URL = "https://github.com/lippdev/joychromium/releases";
/** Release metadata electron-builder publishes next to each build. */
const LATEST_MAC_YML = "https://github.com/lippdev/joychromium/releases/latest/download/latest-mac.yml";
/** What the settings row says on a pre-1.0 build that cannot install by itself (macOS) and so updates by hand. */
export const alphaUpdateStatus = (version: string): string => `v${version} is a pre-release build; new versions come from the releases page`;

/**
 * What the settings row says inside the Flatpak sandbox. The bundle is one unit the host updates together with its
 * runtime, so the app must not download and apply a GitHub build on top of it: that would leave the sandbox files
 * out of sync and break the next host update.
 */
export const FLATPAK_UPDATE_STATUS = "Updates come from Flathub; install the new version from your software center";

/** Where a pending update goes: the system package manager can finish now, everything else needs the release page. */
export function updateInstallRoute(downloaded: boolean, packageManaged: boolean): "package-manager" | "release-page" {
  return downloaded && packageManaged ? "package-manager" : "release-page";
}

/**
 * What the settings row says once a build is downloaded. A deb or rpm is installed by the system package manager, which
 * asks for the user's password, so that has to happen with the window still open instead of at quit time.
 */
export function updateDownloadedNotice(version: string, packageManaged: boolean): string {
  return packageManaged
    ? `v${version} downloaded; restart to install (asks for your password)`
    : `v${version} downloaded; installs when you close JoyChromium`;
}

/** Reads `version:` out of the published update metadata. */
export function versionFromUpdateYml(text: string): string | undefined {
  return /^version:\s*(\S+)\s*$/m.exec(text)?.[1];
}

/**
 * Self-update through electron-updater, fed by GitHub Releases. Every launch checks in the background and downloads
 * silently; an update ready while the app is still opening (`installsAtLaunch`) is installed with the silent NSIS
 * installer and the app reopens on its own, and one that lands later installs silently when the app closes.
 * Versions the remote policy marks as broken are skipped. Does nothing when running unpackaged.
 *
 * macOS builds are not signed with a Developer ID (ADR-010), and Squirrel.Mac refuses to apply updates to an
 * unsigned bundle, so on macOS the updater only reports that a newer version exists and opens the release page.
 *
 * Flatpak builds are updated by the host from Flathub, so inside the sandbox `check()` reports that and stops before
 * electron-updater (or even the release metadata) is reached.
 *
 * Pre-1.0 builds are published as pre-releases, which GitHub's `releases/latest` never serves: electron-updater reads
 * the release feed for them (`allowPrerelease`). Only the macOS path, which reads `releases/latest` by hand, still
 * points a pre-release build at the release list.
 */
export class Updater {
  status = "Not checked yet";
  private downloaded = false;
  private updater: typeof import("electron-updater").autoUpdater | undefined;
  /** Set when a newer version exists but the app must update by hand. */
  manualUpdate: { version: string; url: string } | undefined;

  /** When the process started, to tell an update ready at launch from one that lands while the app is in use. */
  private readonly launchedAt = Date.now();

  constructor(private readonly log: Log, private readonly blockedVersions: () => readonly string[]) {
    if (this.hostUpdatesIt) this.status = FLATPAK_UPDATE_STATUS;
  }

  /** True inside the Flatpak sandbox, where the host owns the bundle and its version. */
  private get hostUpdatesIt(): boolean {
    return currentUpdateInstaller() === "flathub";
  }

  private get installsItself(): boolean {
    return platformId() !== "darwin" && !this.hostUpdatesIt;
  }

  /** True on a deb or rpm install, where the downloaded package goes through dpkg/rpm as root. */
  private get packageManaged(): boolean {
    return installsUpdatesWithPackageManager();
  }

  /** A downloaded package waiting for the user to restart, on an install that asks for the system password. */
  get canInstallNow(): boolean {
    return updateInstallRoute(this.downloaded, this.packageManaged) === "package-manager";
  }

  private get autoUpdater(): typeof import("electron-updater").autoUpdater | undefined {
    if (!app.isPackaged || !this.installsItself) return undefined;
    if (!this.updater) {
      const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
      // The download starts below, once the version is known not to be blocked by the remote policy.
      autoUpdater.autoDownload = false;
      // Pre-releases come from the release feed: `releases/latest` never serves them, and every build below 1.0 is one.
      autoUpdater.allowPrerelease = followsPrereleases(app.getVersion());
      // A package manager prompt after the window closed would be a prompt nobody sees: the user starts the install.
      autoUpdater.autoInstallOnAppQuit = !this.packageManaged;
      autoUpdater.logger = { info: (m) => this.log.info(`updater: ${String(m)}`), warn: (m) => this.log.warn(`updater: ${String(m)}`), error: (m) => this.log.error(`updater: ${String(m)}`), debug: () => undefined };
      autoUpdater.on("update-downloaded", (info) => {
        this.downloaded = true;
        this.status = updateDownloadedNotice(info.version, this.packageManaged);
        if (this.packageManaged || !installsAtLaunch(Date.now() - this.launchedAt)) return;
        // Still opening: install now, silently, and reopen. Nothing the user started is cut off this early.
        this.log.info(`updater: installing v${info.version} at launch`);
        setImmediate(() => autoUpdater.quitAndInstall(true, true));
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
    if (this.hostUpdatesIt) {
      this.status = FLATPAK_UPDATE_STATUS;
      return;
    }
    if (!app.isPackaged) {
      this.status = "Running unpackaged; self-update only works when installed";
      return;
    }
    const updater = this.autoUpdater;
    if (!updater && followsPrereleases(app.getVersion())) {
      this.manualUpdate = { version: app.getVersion(), url: RELEASES_PAGE_URL };
      this.status = alphaUpdateStatus(app.getVersion());
      return;
    }
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
      if (!version || !result.isUpdateAvailable) {
        this.status = `v${app.getVersion()} is up to date`;
        return;
      }
      if (this.blockedVersions().includes(version)) {
        this.status = `v${version} is blocked by policy; staying on v${app.getVersion()}`;
        return;
      }
      this.status = `v${version} available; downloading`;
      // Not awaited: a slow download must not hold the maintenance chain; `update-downloaded` takes it from here.
      updater.downloadUpdate().catch((error: unknown) => {
        this.status = `Update download failed: ${error instanceof Error ? error.message : String(error)}`;
      });
    } catch (error) {
      this.status = `Update check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** Hands a downloaded deb or rpm to the system installer now, while the window can still ask for the password. */
  installPending(): boolean {
    if (!this.canInstallNow || !this.updater) return false;
    this.updater.quitAndInstall();
    return true;
  }

  /** Opens the release page for an update that cannot install itself. */
  async openDownloadPage(): Promise<void> {
    await shell.openExternal(this.manualUpdate?.url ?? RELEASES_URL);
  }
}
