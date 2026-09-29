import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isWebUrl, Pages } from "../shared/pages";
import { type AppSettings, defaultSettings, parseSettings } from "../shared/settings";

/** settings.json and session.json in the data folder. Reads are lenient; writes are whole-file. */
export class SettingsStore {
  current: AppSettings = defaultSettings();

  constructor(readonly dataDir: string, private readonly log: (message: string) => void = () => {}) {}

  get settingsPath(): string {
    return join(this.dataDir, "settings.json");
  }

  get sessionPath(): string {
    return join(this.dataDir, "session.json");
  }

  load(): AppSettings {
    try {
      this.current = existsSync(this.settingsPath) ? parseSettings(JSON.parse(readFileSync(this.settingsPath, "utf8"))) : defaultSettings();
    } catch (error) {
      this.log(`Settings load failed, using defaults: ${String(error)}`);
      this.current = defaultSettings();
    }
    return this.current;
  }

  save(settings: AppSettings): void {
    this.current = settings;
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  update(patch: (current: AppSettings) => AppSettings): AppSettings {
    this.save(patch(this.current));
    return this.current;
  }

  loadSession(): string[] {
    try {
      if (!existsSync(this.sessionPath)) return [];
      const urls = JSON.parse(readFileSync(this.sessionPath, "utf8"));
      return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === "string" && (isWebUrl(u) || u === Pages.newtab)) : [];
    } catch (error) {
      this.log(`Session load failed: ${String(error)}`);
      return [];
    }
  }

  saveSession(urls: readonly string[]): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.sessionPath, JSON.stringify(urls, null, 2));
    } catch (error) {
      this.log(`Session save failed: ${String(error)}`);
    }
  }
}
