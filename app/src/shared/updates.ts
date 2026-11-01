/**
 * Which channel a build follows (E9-04 / release policy) and when a downloaded update is applied.
 *
 * Every release below 1.0 is published as a GitHub pre-release, and `releases/latest` never points at one. electron-
 * updater's `allowPrerelease` reads the release feed instead, so a pre-1.0 or suffixed build follows the pre-releases
 * and still updates by itself.
 */

/** True when the build must look at pre-releases too: anything below 1.0, or any version with a pre-release suffix. */
export function followsPrereleases(version: string): boolean {
  const match = /^(\d+)\.\d+\.\d+(-[0-9A-Za-z.-]+)?/.exec(version);
  if (!match) return true;
  return Number(match[1]) < 1 || Boolean(match[2]);
}

/**
 * How long after launch a downloaded update still restarts the app on the spot. An installer already downloaded by
 * an earlier session is ready within seconds of opening, before anything is playing, so it installs silently right
 * away; one that lands later waits for the app to close, so a video or a form is never cut off.
 */
export const LAUNCH_INSTALL_WINDOW_MS = 45_000;

/** Whether an update that finished downloading `sinceLaunchMs` after launch installs now or when the app closes. */
export function installsAtLaunch(sinceLaunchMs: number): boolean {
  return sinceLaunchMs >= 0 && sinceLaunchMs <= LAUNCH_INSTALL_WINDOW_MS;
}
