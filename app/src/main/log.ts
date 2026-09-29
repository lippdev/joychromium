import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/** Append-only daily log files in <data>/logs, kept for a week. Never throws. */
export class Log {
  static readonly KEEP_DAYS = 7;

  constructor(readonly folder: string) {}

  get currentFile(): string {
    return join(this.folder, `app-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.log`);
  }

  info(message: string): void {
    this.write("INFO", message);
  }

  warn(message: string): void {
    this.write("WARN", message);
  }

  error(message: string, error?: unknown): void {
    this.write("ERROR", error === undefined ? message : `${message}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }

  private write(level: string, message: string): void {
    try {
      mkdirSync(this.folder, { recursive: true });
      appendFileSync(this.currentFile, `${new Date().toISOString()} [${level}] ${message}\n`);
    } catch {
      // Logging must never take the app down.
    }
  }

  /** Deletes log files older than a week. */
  rotate(now: Date = new Date()): void {
    try {
      if (!existsSync(this.folder)) return;
      for (const file of readdirSync(this.folder)) {
        if (!/^app-\d{8}\.log$/.test(file)) continue;
        const path = join(this.folder, file);
        if (now.getTime() - statSync(path).mtimeMs > Log.KEEP_DAYS * 86_400_000) unlinkSync(path);
      }
    } catch {
      // Best effort.
    }
  }

  files(): string[] {
    return existsSync(this.folder) ? readdirSync(this.folder).filter((f) => /^app-\d{8}\.log$/.test(f)).map((f) => join(this.folder, f)) : [];
  }
}
