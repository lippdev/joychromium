import { describe, expect, it } from "vitest";
import { followsUpdateChannel } from "../../src/shared/updates";

describe("update channel", () => {
  it("keeps pre-1.0 builds off the automatic channel", () => {
    expect(followsUpdateChannel("0.1.0")).toBe(false);
    expect(followsUpdateChannel("0.9.9")).toBe(false);
    expect(followsUpdateChannel("0.1.0-alpha.1")).toBe(false);
  });

  it("follows the channel from 1.0 on", () => {
    expect(followsUpdateChannel("1.0.0")).toBe(true);
    expect(followsUpdateChannel("1.2.3")).toBe(true);
    expect(followsUpdateChannel("10.0.0")).toBe(true);
    expect(followsUpdateChannel("2.0.0-beta.1")).toBe(true);
  });

  it("treats a version it cannot read as one more reason to stay manual", () => {
    expect(followsUpdateChannel("")).toBe(false);
    expect(followsUpdateChannel("dev")).toBe(false);
  });
});
