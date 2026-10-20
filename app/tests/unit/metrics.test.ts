import { describe, expect, it } from "vitest";
import {
  BOOT_GOAL_MS, bootMsFromLog, DPAD_GOAL_MS, FAILURE_FACTOR, FIRST_SCREEN_MARK, firstScreenLine, formatReading,
  percentile, reading,
} from "../../src/shared/metrics";

describe("metrics", () => {
  it("writes the first-screen marker the boot measurement reads back", () => {
    expect(firstScreenLine(812)).toBe(`${FIRST_SCREEN_MARK} · 812 ms`);
    expect(firstScreenLine(812.4)).toBe(`${FIRST_SCREEN_MARK} · 812 ms`);
  });

  it("takes the boot time from the app's own log lines, not from the test's clock", () => {
    const log = [
      "2026-10-20T12:00:00.000Z [INFO] JoyChromium 0.1.0 starting · Electron 44.5.1 · Chromium 150.0.0.0",
      "2026-10-20T12:00:00.100Z [INFO] Ad blocking ready",
      "2026-10-20T12:00:00.842Z [INFO] boot: first screen ready · 842 ms",
    ].join("\n");
    expect(bootMsFromLog(log)).toBe(842);
  });

  it("has no boot time until both lines are in the log", () => {
    const starting = "2026-10-20T12:00:00.000Z [INFO] JoyChromium 0.1.0 starting · Electron 44.5.1";
    expect(bootMsFromLog(starting)).toBeUndefined();
    expect(bootMsFromLog(`${starting}\n2026-10-20T12:00:00.500Z [INFO] boot: first screen ready · 500 ms`)).toBe(500);
    expect(bootMsFromLog("")).toBeUndefined();
  });

  it("reads the last pair of lines, so a relaunch into the same file reports the newest boot", () => {
    const log = [
      "2026-10-20T12:00:00.000Z [INFO] JoyChromium 0.1.0 starting · Electron 44.5.1",
      "2026-10-20T12:00:09.000Z [INFO] boot: first screen ready · 9000 ms",
      "2026-10-20T12:10:00.000Z [INFO] JoyChromium 0.1.0 starting · Electron 44.5.1",
      "2026-10-20T12:10:00.650Z [INFO] boot: first screen ready · 650 ms",
    ].join("\n");
    expect(bootMsFromLog(log)).toBe(650);
  });

  it("takes the p95 by nearest rank and ignores order", () => {
    const samples = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(percentile(samples, 0.5)).toBe(90);
    expect(percentile(samples, 0.95)).toBe(99);
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.95)).toBeUndefined();
  });

  it("fails at twice the goal and says which of the two it is", () => {
    expect(FAILURE_FACTOR).toBe(2);
    expect(reading("boot", 812, BOOT_GOAL_MS)).toEqual({ name: "boot", valueMs: 812, goalMs: 2_000, limitMs: 4_000 });
    expect(reading("dpad", 63.4, DPAD_GOAL_MS).valueMs).toBe(63);
    expect(formatReading(reading("boot", 812, BOOT_GOAL_MS))).toBe(
      "boot: 812 ms (inside the goal: goal 2000 ms, fails above 4000 ms)",
    );
    expect(formatReading(reading("D-pad", 63, DPAD_GOAL_MS))).toBe(
      "D-pad: 63 ms (above the goal: goal 50 ms, fails above 100 ms)",
    );
  });
});
