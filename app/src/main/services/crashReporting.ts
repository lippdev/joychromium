import { app, crashReporter } from "electron";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "../log";

/** Where crash reports go when the build has a collector configured. Absent means "keep them local". */
export const CRASH_SUBMIT_URL = process.env.JOYCHROMIUM_CRASH_URL;

/**
 * Crash reports are off unless the user turned them on. With a collector URL the reports are submitted; without one
 * they stay in the data folder and are only shared when the user exports diagnostics.
 */
export class CrashReporting {
  private started = false;

  constructor(private readonly dataDir: string, private readonly log: Log) {}

  get folder(): string {
    return join(this.dataDir, "crashes");
  }

  sync(enabled: boolean): void {
    if (!enabled || this.started) return;
    this.started = true;
    crashReporter.start({
      productName: "JoyChromium",
      companyName: "JoyChromium",
      uploadToServer: Boolean(CRASH_SUBMIT_URL),
      submitURL: CRASH_SUBMIT_URL ?? "",
      ignoreSystemCrashHandler: true,
      compress: true,
      extra: { appVersion: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome, platform: process.platform },
    });
    this.log.info(`Crash reporting enabled (${CRASH_SUBMIT_URL ? "uploading" : "local only"})`);
  }

  /** Report files waiting to be sent, so diagnostics can include them. */
  files(): string[] {
    try {
      return readdirSync(this.folder).map((name) => join(this.folder, name));
    } catch {
      return [];
    }
  }
}
