/**
 * Which channel a build follows (E9-04 / release policy).
 *
 * Every release below 1.0 is published as a pre-release, and GitHub's `releases/latest` never points at a pre-release:
 * an alpha build that asks that URL gets nothing back and ends up reporting a failed update check. So a pre-1.0 build
 * does not chase the automatic channel at all — it offers the releases page and lets the user pick.
 */

/** True when the version follows the automatic update channel, which starts at 1.0. */
export function followsUpdateChannel(version: string): boolean {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 1;
}
