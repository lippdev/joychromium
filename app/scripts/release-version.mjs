#!/usr/bin/env node
// Select a release version without interpreting historic Git tags as published releases.

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemver(version) {
  const match = SEMVER.exec(version.replace(/^v/, ""));
  if (match?.[4]?.split(".").some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  return match;
}

export function isPrerelease(version) {
  const match = parseSemver(version);
  if (!match) throw new Error(`Invalid SemVer version: ${version}`);
  return Boolean(match[4]) || Number(match[1]) === 0;
}

export function selectReleaseVersion({ requested, current, latest, bump = "patch" }) {
  if (requested) {
    const version = requested.replace(/^v/, "");
    if (!parseSemver(version)) throw new Error(`Invalid requested SemVer version: ${requested}`);
    return version;
  }

  // On a clean reset, package.json is the explicit release version. Once releases exist,
  // advance from the latest published release instead of tags that may only be historical.
  const base = (latest || current).replace(/^v/, "");
  const match = parseSemver(base);
  if (!match) throw new Error(`Invalid base SemVer version: ${base}`);
  if (!latest) return base;

  let [major, minor, patch] = match.slice(1, 4).map(Number);
  if (bump === "major") { major += 1; minor = 0; patch = 0; }
  else if (bump === "minor") { minor += 1; patch = 0; }
  else if (bump === "patch") patch += 1;
  else throw new Error(`Invalid version bump: ${bump}`);
  return `${major}.${minor}.${patch}`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  const version = selectReleaseVersion({
    requested: process.env.REQUESTED_VERSION,
    current: process.env.CURRENT_VERSION,
    latest: process.env.LATEST_RELEASE_VERSION,
    bump: process.env.BUMP || "patch",
  });
  process.stdout.write(`${version}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprerelease=${isPrerelease(version)}\n`);
  }
}
