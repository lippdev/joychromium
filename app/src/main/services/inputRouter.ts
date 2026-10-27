import type { WebContents } from "electron";
import type { ControllerEvent } from "../../shared/ipc";
import type { InputMode } from "../../shared/settings";
import { sendArrow, sendKey, spatialActivate, spatialFocusPoint, spatialMove, spatialPlayPause } from "../controllerActions";

export interface InputHost {
  readonly activeWebContents: WebContents | undefined;
  readonly inputMode: InputMode;
  focusPageCursor(x: number, y: number): void;
  /** Whether the active tab is playing media, from the shell's own tab state. */
  isPlayingMedia(): boolean;
  setControllerConnected(connected: boolean, family?: "xbox" | "playstation" | "switch" | "generic"): void;
  openKeyboard(target: "address" | "page"): void;
  /** The D-pad left the top of the page: the tabs and the toolbar take it. */
  enterChrome(): void;
}

/**
 * Turns D-pad page events into page interaction. The window-level pointer is routed by Shell so the stick works over
 * every surface; this router handles mode-specific D-pad behavior and activation inside the page.
 */
export class InputRouter {
  constructor(private readonly host: InputHost) {}

  async run(input: ControllerEvent): Promise<void> {
    const wc = this.host.activeWebContents;
    switch (input.type) {
      case "connected":
        this.host.setControllerConnected(input.connected, input.family);
        break;
      case "direction":
        if (!wc) return;
        if (this.host.inputMode === "Arrows") {
          sendArrow(wc, input.direction);
          const point = await spatialFocusPoint(wc);
          if (point) this.host.focusPageCursor(point.x, point.y);
          break;
        }
        if ((await spatialMove(wc, input.direction)) === "edge") { this.host.enterChrome(); break; }
        const point = await spatialFocusPoint(wc);
        if (point) this.host.focusPageCursor(point.x, point.y);
        break;
      case "activate":
        if (!wc) return;
        if (this.host.inputMode === "Cursor") {
          if ((await spatialActivate(wc)) === "edit") this.host.openKeyboard("page");
          break;
        }
        // The tab state is the cheap gate: a page that never played media keeps A on focus, with no round trip.
        if (this.host.isPlayingMedia() && (await spatialPlayPause(wc)) === "media") break;
        if (this.host.inputMode === "Spatial") {
          if ((await spatialActivate(wc)) === "edit") this.host.openKeyboard("page");
        } else sendKey(wc, "Return");
        break;
    }
  }
}
