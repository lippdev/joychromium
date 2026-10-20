/**
 * Haptic cues for the controller. The profiles are data so the shapes can be tested without hardware: the shell only
 * turns a profile into `vibrationActuator.playEffect("dual-rumble", …)` calls.
 */

export type HapticCue = "confirm" | "error";

export interface HapticPulse {
  /** Milliseconds after the cue started. */
  at: number;
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
}

/**
 * Short on purpose: a confirmation is a tap, not a notification. The error is a double tap at a stronger magnitude so
 * the two are told apart in the hand, and the whole thing stays under a third of a second.
 */
const PROFILES: Record<HapticCue, readonly HapticPulse[]> = {
  confirm: [{ at: 0, duration: 40, strongMagnitude: 0.35, weakMagnitude: 0.3 }],
  error: [
    { at: 0, duration: 90, strongMagnitude: 0.9, weakMagnitude: 0.6 },
    { at: 150, duration: 90, strongMagnitude: 0.9, weakMagnitude: 0.6 },
  ],
};

export function hapticTimeline(cue: HapticCue): readonly HapticPulse[] {
  return PROFILES[cue];
}

/** The statuses the main process prints when it refuses something; the shell answers them with the error cue. */
export function isBlockedStatus(status: string): boolean {
  return /\bBLOCKED\b/.test(status);
}
