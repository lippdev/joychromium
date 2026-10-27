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

/** Center of the page's current spatial target, used to keep the pointer in step with D-pad focus. */
export async function spatialFocusPoint(wc: WebContents): Promise<{ x: number; y: number } | undefined> {
  return (await runInPageWorld<{ x: number; y: number }>(wc, "window.__joy && window.__joy.focusPoint()")) ?? undefined;
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
  private drawing = false;
  private redraw = false;

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
    await this.draw(wc);
  }

  async moveTo(wc: WebContents, x: number, y: number, width: number, height: number): Promise<void> {
    this.place(x, y, width, height);
    wc.sendInputEvent({ type: "mouseMove", x: Math.round(this.x), y: Math.round(this.y) });
    await this.draw(wc);
  }

  /**
   * Draws the pointer where it is now. Moves arrive about 60 times a second; while one drawing is still on its way into
   * the page, the next ones only ask for another, which then uses the latest position: the pointer never lags behind a
   * queue of old ones.
   */
  private async draw(wc: WebContents): Promise<void> {
    if (this.drawing) {
      this.redraw = true;
      return;
    }
    this.drawing = true;
    try {
      do {
        this.redraw = false;
        await this.show(wc, true);
      } while (this.redraw);
    } finally {
      this.drawing = false;
    }
  }

  click(wc: WebContents, button: "left" | "right" = "left"): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    wc.sendInputEvent({ type: "mouseMove", x, y });
    wc.sendInputEvent({ type: "mouseDown", x, y, button, clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x, y, button, clickCount: 1 });
    void runInPageWorld(wc, "window.__joyCursor && window.__joyCursor.press()");
  }

  /**
   * Positive notches scroll down (Gamepad API stick Y grows downward) and positive `sideways` to the right; wheel deltas
   * are negative for those. The wheel turns under the pointer, so whatever box it is over scrolls, like a real mouse.
   */
  scroll(wc: WebContents, notches: number, sideways = 0): void {
    wc.sendInputEvent({ type: "mouseWheel", x: Math.round(this.x), y: Math.round(this.y), deltaX: -sideways * 120, deltaY: -notches * 120 });
  }
}
