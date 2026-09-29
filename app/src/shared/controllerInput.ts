import type { InputMode } from "./settings";

/** Pure controller math and mode rules. Stick values are normalised to -1..1 (Gamepad API) here. */

export const STICK_DEADZONE = 0.25;
export const DIRECTION_THRESHOLD = 0.5;
export const MAX_CURSOR_SPEED = 22; // px per 50 ms tick at full deflection

/** Hosts whose pages already implement arrow-key navigation (10-foot UIs). */
const ARROW_HOSTS = ["youtube.com", "tv.youtube.com", "twitch.tv"];

export function defaultModeFor(host: string | undefined, fallback: InputMode = "Spatial"): InputMode {
  if (!host) return fallback;
  const h = host.toLowerCase();
  return ARROW_HOSTS.some((known) => h === known || h.endsWith(`.${known}`)) ? "Arrows" : fallback;
}

export function nextMode(mode: InputMode): InputMode {
  switch (mode) {
    case "Spatial":
      return "Cursor";
    case "Cursor":
      return "Arrows";
    default:
      return "Spatial";
  }
}

/**
 * Maps a stick to a cursor displacement for one tick: circular deadzone, then a squared response curve so small
 * deflections give fine control and full deflection reaches MAX_CURSOR_SPEED. Gamepad API Y grows downward already.
 */
export function stickToVelocity(x: number, y: number, deadzone = STICK_DEADZONE, maxSpeed = MAX_CURSOR_SPEED): { dx: number; dy: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { dx: 0, dy: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  const speed = scaled * scaled * maxSpeed;
  return { dx: (x / magnitude) * speed, dy: (y / magnitude) * speed };
}

/** Wheel notches for one tick from a stick's vertical axis (positive = scroll down, matching Gamepad API Y). */
export function stickToScroll(y: number, deadzone = STICK_DEADZONE): number {
  return Math.abs(y) <= deadzone ? 0 : Math.sign(y);
}

export type Direction = "up" | "down" | "left" | "right";

/** Direction from d-pad booleans or a stick, or undefined when centred. */
export function directionOf(dpad: { up: boolean; down: boolean; left: boolean; right: boolean }, stickX: number, stickY: number): Direction | undefined {
  if (dpad.up || stickY < -DIRECTION_THRESHOLD) return "up";
  if (dpad.down || stickY > DIRECTION_THRESHOLD) return "down";
  if (dpad.left || stickX < -DIRECTION_THRESHOLD) return "left";
  if (dpad.right || stickX > DIRECTION_THRESHOLD) return "right";
  return undefined;
}

/** Standard Gamepad API button indexes (Xbox layout). */
export const Button = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;
