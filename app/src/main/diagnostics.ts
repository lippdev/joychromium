import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { arch, platform, release } from "node:os";
import type { Log } from "./log";
import type { SettingsStore } from "./store";

/** Zips logs plus settings (site permissions stripped) for a bug report. Returns the zip path. */
export async function exportDiagnostics(targetFolder: string, log: Log, store: SettingsStore, environmentLines: string[]): Promise<string> {
  mkdirSync(targetFolder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const zipPath = join(targetFolder, `joychromium-diagnostics-${stamp}.zip`);
  const { createZip } = await import("./zip");
  const entries: { name: string; data: Buffer }[] = [];
  const { readFileSync } = await import("node:fs");
  for (const file of log.files()) entries.push({ name: `logs/${file.split(/[\\/]/).pop()}`, data: readFileSync(file) });
  entries.push({ name: "settings.json", data: Buffer.from(JSON.stringify({ ...store.current, sitePermissions: {} }, null, 2)) });
  entries.push({ name: "environment.txt", data: Buffer.from([`OS ${platform()} ${release()} ${arch()}`, `Node ${process.versions.node}`, ...environmentLines].join("\n")) });
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath);
    out.on("finish", resolve);
    out.on("error", reject);
    out.end(createZip(entries));
  });
  return zipPath;
}
