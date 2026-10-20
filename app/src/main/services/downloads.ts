import { existsSync } from "node:fs";
import { join } from "node:path";
import { isDangerousDownload, safeFileName } from "../../shared/security";

/** How a download is named on disk: never outside the folder, never over an existing file. */
export function nextAvailablePath(folder: string, name: string, taken: (path: string) => boolean = existsSync): string {
  const clean = safeFileName(name);
  let target = join(folder, clean);
  const dot = clean.lastIndexOf(".");
  for (let i = 1; taken(target); i++) {
    target = join(folder, dot > 0 ? `${clean.slice(0, dot)} (${i})${clean.slice(dot)}` : `${clean} (${i})`);
  }
  return target;
}

export interface DownloadPolicy {
  folder: string;
  blockDangerous: boolean;
  extraDangerous: readonly string[];
}

export type DownloadDecision = { action: "allow"; path: string } | { action: "block"; name: string };

/** Decides what happens to a download before a byte is written. */
export function decideDownload(fileName: string, policy: DownloadPolicy, taken: (path: string) => boolean = existsSync): DownloadDecision {
  const name = safeFileName(fileName);
  if (policy.blockDangerous && isDangerousDownload(name, policy.extraDangerous)) return { action: "block", name };
  return { action: "allow", path: nextAvailablePath(policy.folder, name, taken) };
}

/** The detail of a download progress message: the file, and how far along it is when the size is known. */
export function downloadDetail(name: string, received: number, total: number): string {
  return total <= 0 ? name : `${name} · ${Math.round((received * 100) / total)}%`;
}
