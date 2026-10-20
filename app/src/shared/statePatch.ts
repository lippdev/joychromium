/**
 * Per-area shell state patches (E3-03, D15).
 *
 * The chrome UI needs the whole shell state once, when it starts. After that, the main process sends only the areas
 * that changed, and the renderer applies them over what it already has. A change to the toast line therefore costs a
 * few dozen bytes instead of a snapshot that repeats every open tab.
 */

import type { ShellState, ShellStatePatch } from "./ipc";

export type ShellStateArea = "tabs" | "status" | "chrome" | "overlay" | "keyboard" | "find" | "suggestions" | "settings";

/**
 * Which area carries each field. Typed as `Record<keyof ShellState, …>`, so a new state field fails the typecheck
 * until it is placed in an area, instead of silently never reaching the UI.
 */
const areaOf: Record<keyof ShellState, ShellStateArea> = {
  tabs: "tabs",
  activeUrl: "tabs",
  isFavorite: "tabs",
  status: "status",
  chromeVisible: "chrome",
  inputMode: "chrome",
  adBlock: "chrome",
  controllerConnected: "chrome",
  controllerFamily: "chrome",
  permission: "overlay",
  keyboard: "keyboard",
  find: "find",
  suggestions: "suggestions",
  theme: "settings",
  shortcutMod: "settings",
  nativeWindowControls: "settings",
  windowMode: "settings",
  uiScale: "settings",
  overscan: "settings",
  highContrast: "settings",
  language: "settings",
  crashReports: "settings",
};

const grouped = {
  tabs: [], status: [], chrome: [], overlay: [], keyboard: [], find: [], suggestions: [], settings: [],
} as Record<ShellStateArea, (keyof ShellState)[]>;
for (const [field, area] of Object.entries(areaOf) as [keyof ShellState, ShellStateArea][]) grouped[area].push(field);

/** Every state field, grouped by the area whose patch carries it. */
export const ShellStateAreas: Readonly<Record<ShellStateArea, readonly (keyof ShellState)[]>> = grouped;

/** Deep equality for the state values: arrays of tabs, plain objects, and primitives. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && sameValue(left[key], right[key]));
}

/**
 * The patch that turns `previous` into `next`, or `undefined` when nothing changed. Each changed area travels whole,
 * so a patch always carries the complete value of every field of that area, and the renderer can spread it over the
 * state it already has.
 */
export function diffShellState(previous: ShellState, next: ShellState): ShellStatePatch | undefined {
  const patch: Record<string, unknown> = {};
  for (const area of Object.keys(ShellStateAreas) as ShellStateArea[]) {
    const fields = ShellStateAreas[area];
    if (fields.every((field) => sameValue(previous[field], next[field]))) continue;
    for (const field of fields) patch[field] = next[field];
  }
  return Object.keys(patch).length > 0 ? (patch as ShellStatePatch) : undefined;
}

/** Applies a patch over the state the renderer already has. */
export function applyShellStatePatch(state: ShellState, patch: ShellStatePatch): ShellState {
  return { ...state, ...patch };
}
