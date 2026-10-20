/**
 * The two time budgets of the PRD (section 11), measured by the suite instead of checked by hand.
 *
 * The boot comes out of the app's own log: `main.ts` writes one line when the process starts and one when the first
 * screen is on the glass, and the difference between the two is the number the PRD asks for. Nothing in here is a
 * guess about what the app did.
 */

/** From process start to the first screen: "Boot até a tela inicial < 2 s". */
export const BOOT_GOAL_MS = 2_000;

/** From the D-pad press to the focus moving, at the 95th percentile: "< 50 ms (p95)". */
export const DPAD_GOAL_MS = 50;

/**
 * The suite fails at twice the goal, never at the goal itself: a shared runner is a slower machine than the TV this
 * budget is written for, and a test that goes red on the exact number would be flaky without saying anything new. What
 * it catches is a real regression — a loop that stopped polling, a focus that stopped moving.
 */
export const FAILURE_FACTOR = 2;

/** The marker `main.ts` writes the moment the first screen has loaded, right after the `starting` line. */
export const FIRST_SCREEN_MARK = "boot: first screen ready";

/** One metric as the suite reports it: the measurement, the PRD's goal and the value the test refuses. */
export interface MetricReading {
  /** What was measured, in words, so a log line reads on its own. */
  name: string;
  valueMs: number;
  goalMs: number;
  /** Twice the goal: the only value the suite asserts on. */
  limitMs: number;
}

export function reading(name: string, valueMs: number, goalMs: number): MetricReading {
  return { name, valueMs: Math.round(valueMs), goalMs, limitMs: goalMs * FAILURE_FACTOR };
}

/** `boot: first screen ready · 812 ms` — the log line the boot measurement reads. */
export function firstScreenLine(ms: number): string {
  return `${FIRST_SCREEN_MARK} · ${Math.max(0, Math.round(ms))} ms`;
}

const LOG_LINE = /^(\S+Z) \[INFO\] (.*)$/;

/**
 * Milliseconds from the `starting` line to the first-screen marker, read from the app's log, or undefined while the
 * log has only one of them. Both stamps are the app's own, so this needs no clock shared with the test.
 */
export function bootMsFromLog(text: string): number | undefined {
  let started: number | undefined;
  let ready: number | undefined;
  for (const line of text.split("\n")) {
    const match = LOG_LINE.exec(line.trim());
    if (!match) continue;
    const at = Date.parse(match[1]!);
    if (Number.isNaN(at)) continue;
    const message = match[2]!;
    if (message.includes(" starting · ")) started = at;
    else if (message.startsWith(FIRST_SCREEN_MARK)) ready = at;
  }
  return started === undefined || ready === undefined ? undefined : Math.max(0, ready - started);
}

/** The value at `fraction` of the sorted samples (nearest rank), or undefined for no samples. */
export function percentile(values: readonly number[], fraction: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank];
}

/** The line the suite prints, and the CI step shows, for one metric. */
export function formatReading(item: MetricReading): string {
  const verdict = item.valueMs <= item.goalMs ? "inside the goal" : "above the goal";
  return `${item.name}: ${item.valueMs} ms (${verdict}: goal ${item.goalMs} ms, fails above ${item.limitMs} ms)`;
}
