/**
 * How often the shell reads the controller (E4-03).
 *
 * The loop runs on a timer. An animation-frame loop looked cheaper, but Chromium stops animation frames for a renderer
 * that is occluded — and a page in HTML fullscreen covers the shell — which left a fullscreen video with no working
 * buttons, B included. A timer keeps running while the renderer is occluded. The main process still reports the real
 * window state, so a minimized window parks the loop instead of polling a controller nobody can see; the shell is
 * frameless, so `document.hidden` alone never tells it that.
 */

/** A 20 Hz read is enough for a controller: the fastest meaningful input, a D-pad repeat, runs at about 5 Hz. */
export const GAMEPAD_POLL_MS = 50;

export type GamepadPoll = "poll" | "wait" | "park";

/**
 * What the loop does on this frame. `park` means "stop requesting frames" — the loop is restarted by the window
 * becoming visible again, never by this frame.
 */
export function gamepadPoll(now: number, lastPoll: number, window: { hidden: boolean; active: boolean }): GamepadPoll {
  if (window.hidden || !window.active) return "park";
  return now - lastPoll < GAMEPAD_POLL_MS ? "wait" : "poll";
}
