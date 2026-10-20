import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes a file so that a crash or a power cut leaves either the old content or the new one, never a half file:
 * the data goes to a sibling temporary file, is flushed, and only then replaces the target with a rename.
 */
export function writeFileAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

/** Parses JSON from `path`; any read or parse failure is reported and returns undefined instead of throwing. */
export function readJsonFile(path: string, log: (message: string) => void): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    log(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
