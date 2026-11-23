/** Whether a build with a SemVer pre-release suffix follows the GitHub pre-release feed. */
export function followsPrereleases(version: string): boolean {
  const match = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return true;
  return Boolean(match[1]);
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
