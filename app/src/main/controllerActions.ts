import type { WebContents } from "electron";
import type { Direction } from "../shared/controllerInput";
import type { MediaAction } from "../shared/media";

/** Turns controller intents into page input. Everything here goes through Chromium's input pipeline, so it is cross-platform. */

const ARROW_KEYS: Record<Direction, string> = { up: "Up", down: "Down", left: "Left", right: "Right" };

export function sendKey(wc: WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: "keyDown", keyCode });
  wc.sendInputEvent({ type: "keyUp", keyCode });
}

export function sendArrow(wc: WebContents, direction: Direction): void {
  sendKey(wc, ARROW_KEYS[direction]);
}

/**
 * The injected scripts live in their own world, so the page cannot see or replace `window.__joy`. Every interaction
 * with them has to run in that same world.
 */
export const SPATIAL_WORLD = 73;

export async function runInPageWorld<T>(wc: WebContents, code: string): Promise<T | undefined> {
  try {
    return (await wc.executeJavaScriptInIsolatedWorld(SPATIAL_WORLD, [{ code }])) as T;
  } catch {
    return undefined;
  }
}

export async function spatialMove(wc: WebContents, direction: Direction): Promise<void> {
  await runInPageWorld(wc, `window.__joy && window.__joy.move(${JSON.stringify(direction)})`);
}

export async function spatialActivate(wc: WebContents): Promise<void> {
  await runInPageWorld(wc, "window.__joy && window.__joy.activate()");
}

const MEDIA_CALLS: Record<MediaAction, string> = { toggle: "playPause", next: "mediaNext", previous: "mediaPrevious" };

/** Runs a media action in the injected script; false when the page has nothing to play, pause or skip. */
export async function spatialMedia(wc: WebContents, action: MediaAction): Promise<boolean> {
  const call = MEDIA_CALLS[action];
  return Boolean(await runInPageWorld<boolean>(wc, `window.__joy && window.__joy.${call} ? window.__joy.${call}() : false`));
}

/** Play/pause and track skipping for the media keys and the quick menu. */
export async function mediaControl(wc: WebContents | undefined, action: MediaAction): Promise<void> {
  if (wc) await spatialMedia(wc, action);
}

/** Virtual cursor: the overlay is drawn by the injected script; hover and clicks are real input events at the same point. */
export class VirtualCursor {
  x = 200;
  y = 200;
  placed = false;

  place(x: number, y: number, width: number, height: number): void {
    this.x = Math.min(Math.max(0, x), Math.max(0, width - 1));
    this.y = Math.min(Math.max(0, y), Math.max(0, height - 1));
    this.placed = true;
  }

  async show(wc: WebContents, visible: boolean): Promise<void> {
    await runInPageWorld(wc, `window.__joyCursor && window.__joyCursor.show(${visible}, ${this.x}, ${this.y})`);
  }

  async moveBy(wc: WebContents, dx: number, dy: number, width: number, height: number): Promise<void> {
    this.place(this.x + dx, this.y + dy, width, height);
    wc.sendInputEvent({ type: "mouseMove", x: Math.round(this.x), y: Math.round(this.y) });
    await this.show(wc, true);
  }

  click(wc: WebContents): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    wc.sendInputEvent({ type: "mouseMove", x, y });
    wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  }

  /** Positive notches scroll down (Gamepad API stick Y grows downward); wheel deltaY is negative for down. */
  scroll(wc: WebContents, notches: number): void {
    wc.sendInputEvent({ type: "mouseWheel", x: Math.round(this.x), y: Math.round(this.y), deltaX: 0, deltaY: -notches * 120 });
  }
}
