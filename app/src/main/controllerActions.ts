import type { WebContents } from "electron";
import type { Direction } from "../shared/controllerInput";
import { activateIntent, type ActivateIntent, type MediaAction } from "../shared/media";
import { SPATIAL_WORLD } from "../shared/spatial";

/** Turns controller intents into page input. Everything here goes through Chromium's input pipeline, so it is cross-platform. */

const ARROW_KEYS: Record<Direction, string> = { up: "Up", down: "Down", left: "Left", right: "Right" };

export function sendKey(wc: WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: "keyDown", keyCode });
  wc.sendInputEvent({ type: "keyUp", keyCode });
}

export function sendArrow(wc: WebContents, direction: Direction): void {
  sendKey(wc, ARROW_KEYS[direction]);
}

/** The injected scripts live in `SPATIAL_WORLD`, out of the page's reach, so every interaction has to run there. */
export async function runInPageWorld<T>(wc: WebContents, code: string, userGesture = false): Promise<T | undefined> {
  try {
    return (await wc.executeJavaScriptInIsolatedWorld(SPATIAL_WORLD, [{ code }], userGesture)) as T;
  } catch {
    return undefined;
  }
}

/** "edge" when the D-pad went up from the top of the page: there is nothing left in it to walk to. */
export async function spatialMove(wc: WebContents, direction: Direction): Promise<string | undefined> {
  return runInPageWorld<string>(wc, `window.__joy && window.__joy.move(${JSON.stringify(direction)})`);
}

/** "edit" when A landed on a text field, which then wants the controller keyboard. */
export async function spatialActivate(wc: WebContents): Promise<string | undefined> {
  return runInPageWorld<string>(wc, "window.__joy && window.__joy.activate()");
}

const MEDIA_CALLS: Record<MediaAction, string> = {
  toggle: "mediaToggle", next: "mediaNext", previous: "mediaPrevious", pip: "mediaPictureInPicture",
};

/**
 * Runs an explicit media action in the injected script; false when the page has nothing to play, pause, skip or put in
 * a picture-in-picture window. Entering picture-in-picture needs transient user activation, so that one asks for it.
 */
export async function spatialMedia(wc: WebContents, action: MediaAction): Promise<boolean> {
  const call = MEDIA_CALLS[action];
  return Boolean(await runInPageWorld<boolean>(wc, `window.__joy && window.__joy.${call} ? window.__joy.${call}() : false`, action === "pip"));
}

/** A's media decision: "media" only when the page paused audible playback that was running. */
export async function spatialPlayPause(wc: WebContents): Promise<ActivateIntent> {
  const decision = await runInPageWorld<unknown>(wc, "window.__joy && window.__joy.playPause ? window.__joy.playPause() : 'focus'");
  return activateIntent(decision);
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
