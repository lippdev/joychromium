import { describe, expect, it } from "vitest";
import { ensureTvIdentity, isTvIdentityActive, TV_MARKER } from "../../src/main/tvIdentity";

const source = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36";

describe("tvIdentity", () => {
  it("appends the marker once", () => {
    const tv = ensureTvIdentity(source);
    expect(isTvIdentityActive(tv)).toBe(true);
    expect(tv).toContain("(TV; SmartTV)");
    expect(ensureTvIdentity(tv)).toBe(tv);
  });

  it("refuses a malformed marker", () => {
    expect(() => ensureTvIdentity(`${source} JoyChromiumTV/broken`)).toThrow();
  });

  it("refuses an empty agent", () => {
    expect(() => ensureTvIdentity("  ")).toThrow();
  });

  it("marker is stable", () => {
    expect(TV_MARKER).toBe("JoyChromiumTV/1.0 (TV; SmartTV)");
  });
});
