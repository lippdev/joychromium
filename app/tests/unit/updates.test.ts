import { describe, expect, it } from "vitest";
import { followsPrereleases, installsAtLaunch, LAUNCH_INSTALL_WINDOW_MS } from "../../src/shared/updates";

describe("update channel", () => {
  it("follows the pre-releases below 1.0 and on suffixed versions", () => {
    expect(followsPrereleases("0.1.0")).toBe(true);
    expect(followsPrereleases("0.1.4-beta")).toBe(true);
    expect(followsPrereleases("0.1.0-alpha.1")).toBe(true);
    expect(followsPrereleases("2.0.0-beta.1")).toBe(true);
  });

  it("follows the stable releases from 1.0 on", () => {
    expect(followsPrereleases("1.0.0")).toBe(false);
    expect(followsPrereleases("1.2.3")).toBe(false);
    expect(followsPrereleases("10.0.0")).toBe(false);
  });

  it("looks at everything when it cannot read the version", () => {
    expect(followsPrereleases("")).toBe(true);
    expect(followsPrereleases("dev")).toBe(true);
  });
});

describe("when an update installs", () => {
  it("installs right away while the app is just opening", () => {
    expect(installsAtLaunch(0)).toBe(true);
    expect(installsAtLaunch(5_000)).toBe(true);
    expect(installsAtLaunch(LAUNCH_INSTALL_WINDOW_MS)).toBe(true);
  });

  it("waits for the app to close once the user is using it", () => {
    expect(installsAtLaunch(LAUNCH_INSTALL_WINDOW_MS + 1)).toBe(false);
    expect(installsAtLaunch(10 * 60_000)).toBe(false);
    expect(installsAtLaunch(-1)).toBe(false);
  });
});
