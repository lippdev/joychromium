import { hapticTimeline, type HapticCue } from "../../shared/haptics";
import { bridge } from "./bridge";

/** The pad the shell is listening to: a cue goes to the controller in the user's hands, not to the first one found. */
let active: Gamepad | null = null;

export function trackActivePad(pad: Gamepad | null): void {
  active = pad;
}

/**
 * Plays a cue on the active pad when the user asked for vibration. Fire and forget: input handling never waits on the
 * preference read or on the actuator, and a controller without one (or a refused effect) is simply silent.
 */
export function vibrate(cue: HapticCue): void {
  const pad = active;
  const actuator = pad?.vibrationActuator;
  if (!pad || !actuator || typeof actuator.playEffect !== "function") return;
  void bridge()
    .preferences()
    .then(({ vibration }) => {
      if (!vibration || active !== pad) return;
      for (const pulse of hapticTimeline(cue)) {
        setTimeout(() => {
          void actuator
            .playEffect("dual-rumble", {
              duration: pulse.duration,
              strongMagnitude: pulse.strongMagnitude,
              weakMagnitude: pulse.weakMagnitude,
            })
            .catch(() => undefined);
        }, pulse.at);
      }
    })
    .catch(() => undefined);
}
