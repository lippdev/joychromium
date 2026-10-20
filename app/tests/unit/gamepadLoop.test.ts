import { describe, expect, it } from "vitest";
import { GAMEPAD_POLL_MS, gamepadPoll } from "../../src/shared/gamepadLoop";

const onScreen = { hidden: false, active: true };

describe("controller polling", () => {
  it("polls a visible window at the configured rate", () => {
    expect(gamepadPoll(1000, 1000 - GAMEPAD_POLL_MS, onScreen)).toBe("poll");
    expect(gamepadPoll(1000, 0, onScreen)).toBe("poll");
  });

  it("holds frames until the next poll is due", () => {
    expect(gamepadPoll(1000, 999, onScreen)).toBe("wait");
    expect(gamepadPoll(1000, 1000 - GAMEPAD_POLL_MS + 1, onScreen)).toBe("wait");
  });

  it("parks a minimized window, where the page never reports itself hidden", () => {
    expect(gamepadPoll(1000, 0, { hidden: false, active: false })).toBe("park");
    expect(gamepadPoll(60_000, 0, { hidden: false, active: false })).toBe("park");
  });

  it("parks a hidden document even if the window still counts as active", () => {
    expect(gamepadPoll(1000, 0, { hidden: true, active: true })).toBe("park");
    expect(gamepadPoll(1000, 0, { hidden: true, active: false })).toBe("park");
  });
});
