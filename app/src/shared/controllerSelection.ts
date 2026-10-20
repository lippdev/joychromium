/** Which connected pad owns the input. Two controllers can be on at once; the one the user picks up takes over. */

import { DIRECTION_THRESHOLD } from "./controllerInput";

export interface PadSample {
  /** `Gamepad.index`: the slot the system gives a pad, stable while it stays connected. */
  index: number;
  /** The standard mapping, the one whose button numbers the shell follows. */
  standard: boolean;
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

/** A pad is in use when a button is held or a stick is pushed past the direction threshold. */
export function padInUse(pad: PadSample, threshold = DIRECTION_THRESHOLD): boolean {
  if (pad.buttons.some((button) => button.pressed)) return true;
  return pad.axes.some((axis) => Math.abs(axis) > threshold);
}

/** The pads the user is touching right now, by index, in the order the Gamepad API lists them. */
export function padsInUse(pads: readonly PadSample[], threshold = DIRECTION_THRESHOLD): number[] {
  return pads.filter((pad) => padInUse(pad, threshold)).map((pad) => pad.index);
}

/**
 * Indexes that started being used since the previous poll. A finger resting on a button stays in use poll after poll
 * and never counts twice, so it cannot keep stealing the input from the pad the user just pressed.
 */
export function startedUsing(previous: readonly number[], inUse: readonly number[]): number[] {
  return inUse.filter((index) => !previous.includes(index));
}

/**
 * The pad in the user's hands: the last one used keeps it while it is the one being used, and another pad that starts
 * being used takes over — no restart, no dialog. With nothing being used, the current pad stays if it is still
 * connected; a fresh connection prefers a standard-mapping pad and then the first one listed.
 */
export function activePad(current: number | null, pads: readonly PadSample[], started: readonly number[]): number | null {
  if (pads.length === 0) return null;
  if (current !== null && started.includes(current)) return current;
  const challenger = pads.find((pad) => started.includes(pad.index));
  if (challenger) return challenger.index;
  if (current !== null && pads.some((pad) => pad.index === current)) return current;
  const standard = pads.find((pad) => pad.standard);
  return (standard ?? pads[0]!).index;
}
