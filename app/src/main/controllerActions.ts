import type { WebContents } from "electron";
import type { Direction } from "../shared/controllerInput";

/** Turns controller intents into page input. Everything here goes through Chromium's input pipeline, so it is cross-platform. */

const ARROW_KEYS: Record<Direction, string> = { up: "Up", down: "Down", left: "Left", right: "Right" };

export function sendKey(wc: WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: "keyDown", keyCode });
  wc.sendInputEvent({ type: "keyUp", keyCode });
}

export function sendArrow(wc: WebContents, direction: Direction): void {
  sendKey(wc, ARROW_KEYS[direction]);
}

export async function spatialMove(wc: WebContents, direction: Direction): Promise<void> {
  await wc.executeJavaScript(`window.__joy && window.__joy.move(${JSON.stringify(direction)})`, true).catch(() => undefined);
}

export async function spatialActivate(wc: WebContents): Promise<void> {
  await wc.executeJavaScript("window.__joy && window.__joy.activate()", true).catch(() => undefined);
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
    await wc.executeJavaScript(`window.__joyCursor && window.__joyCursor.show(${visible}, ${this.x}, ${this.y})`, true).catch(() => undefined);
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

  scroll(wc: WebContents, notches: number): void {
    wc.sendInputEvent({ type: "mouseWheel", x: Math.round(this.x), y: Math.round(this.y), deltaX: 0, deltaY: -notches * 120 });
  }
}
