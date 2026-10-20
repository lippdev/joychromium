/**
 * How often the shell reads the controller (E4-03).
 *
 * The loop runs on animation frames, which Chromium keeps delivering to this window even when it is minimized or
 * hidden: the shell is frameless, so `document.hidden` never turns true and an idle console would keep waking up sixty
 * times a second to poll a controller nobody can see. The main process knows the real window state, so it reports it
 * and the loop parks — no more frames at all until the window is back on screen.
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
