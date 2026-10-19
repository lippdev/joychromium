import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isWebUrl, Pages } from "../shared/pages";
import { type AppSettings, defaultSettings, parseSettings, SETTINGS_SCHEMA_VERSION } from "../shared/settings";
import { readJsonFile, writeFileAtomic } from "./atomicFile";

/**
 * settings.json and session.json in the data folder.
 * Reads are lenient (a corrupt file falls back to the last good copy, then to the defaults) and writes are atomic,
 * so a crash during a save can never leave a half-written profile behind.
 */
export class SettingsStore {
  current: AppSettings = defaultSettings();
  private lastWritten = "";

  constructor(readonly dataDir: string, private readonly log: (message: string) => void = () => {}) {}

  get settingsPath(): string {
    return join(this.dataDir, "settings.json");
  }

  get sessionPath(): string {
    return join(this.dataDir, "session.json");
  }

  get backupPath(): string {
    return join(this.dataDir, "settings.backup.json");
  }

  load(): AppSettings {
    const raw = readJsonFile(this.settingsPath, this.log);
    if (raw === undefined) {
      this.current = defaultSettings();
      return this.current;
    }
    this.current = parseSettings(raw);
    this.lastWritten = JSON.stringify(this.current);
    return this.current;
  }

  save(settings: AppSettings): void {
    this.current = settings;
    const body = JSON.stringify({ ...settings, schemaVersion: SETTINGS_SCHEMA_VERSION }, null, 2);
    if (body === this.lastWritten) return;
    try {
      // The previous file stays as a backup: a damaged settings.json is rare, but it is the one file nobody wants to lose.
      const previous = readJsonFile(this.settingsPath, this.log);
      if (previous !== undefined) writeFileAtomic(this.backupPath, JSON.stringify(previous));
      writeFileAtomic(this.settingsPath, body);
      this.lastWritten = body;
    } catch (error) {
      this.log(`Settings save failed: ${String(error)}`);
    }
  }

  update(patch: (current: AppSettings) => AppSettings): AppSettings {
    this.save(patch(this.current));
    return this.current;
  }

  loadSession(): string[] {
    const raw = readJsonFile(this.sessionPath, this.log);
    return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string" && (isWebUrl(u) || u === Pages.newtab)) : [];
  }

  saveSession(urls: readonly string[]): void {
    try {
      writeFileAtomic(this.sessionPath, JSON.stringify(urls, null, 2));
    } catch (error) {
      this.log(`Session save failed: ${String(error)}`);
    }
  }

  get runningPath(): string {
    return join(this.dataDir, "running.json");
  }

  /** Leaves a marker while the app runs; a marker found at start means the previous run did not close cleanly. */
  markRunning(): void {
    try {
      writeFileSync(this.runningPath, new Date().toISOString());
    } catch (error) {
      this.log(`Could not write the running marker: ${String(error)}`);
    }
  }

  markCleanExit(): void {
    try {
      if (existsSync(this.runningPath)) rmSync(this.runningPath);
    } catch (error) {
      this.log(`Could not clear the running marker: ${String(error)}`);
    }
  }

  previousRunCrashed(): boolean {
    return existsSync(this.runningPath);
  }
}
