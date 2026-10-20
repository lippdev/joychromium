/**
 * How often the shell reads the controller (E4-03).
 *
 * The loop runs on a timer. An animation-frame loop looked cheaper, but Chromium stops animation frames for a renderer
 * that is occluded — and a page in HTML fullscreen covers the shell — which left a fullscreen video with no working
 * buttons, B included. A timer keeps running while the renderer is occluded. The main process still reports the real
 * window state, so a minimized window parks the loop instead of polling a controller nobody can see; the shell is
 * frameless, so `document.hidden` alone never tells it that.
 */

/**
 * How often the pad is read: 60 Hz, the rate the loop had when it was driven by animation frames. The budget that sets
 * it is the PRD's "D-pad to focus moves" at 50 ms p95 (section 11): every millisecond of the poll window lands on that
 * number, and 60 Hz is both the finest granularity a display can show and the cadence the app already paid for.
 */
export const GAMEPAD_POLL_MS = 16;

/**
 * How often the stick moves the cursor and scrolls. Continuous motion keeps the cadence it had at 20 Hz, so the cursor
 * and the wheel do not change speed just because the buttons got faster: the poll rate is a latency decision, not a
 * speed decision.
 */
export const STICK_INTERVAL_MS = 50;

export type GamepadPoll = "poll" | "wait" | "park";

/**
 * What the loop does on this tick. `park` means "stop the timer" — it is restarted by the window becoming visible
 * again, never by this tick.
 */
export function gamepadPoll(now: number, lastPoll: number, window: { hidden: boolean; active: boolean }): GamepadPoll {
  if (window.hidden || !window.active) return "park";
  return now - lastPoll < GAMEPAD_POLL_MS ? "wait" : "poll";
}
