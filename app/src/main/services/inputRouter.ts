import type { WebContents } from "electron";
import type { ControllerEvent } from "../../shared/ipc";
import type { InputMode } from "../../shared/settings";
import { sendArrow, sendKey, spatialActivate, spatialMove, spatialPlayPause, type VirtualCursor } from "../controllerActions";

export interface InputHost {
  readonly activeWebContents: WebContents | undefined;
  readonly inputMode: InputMode;
  pageSize(): { width: number; height: number };
  /** Whether the active tab is playing media, from the shell's own tab state. */
  isPlayingMedia(): boolean;
  setControllerConnected(connected: boolean, family?: "xbox" | "playstation" | "switch" | "generic"): void;
}

/**
 * Turns gamepad events into page interaction. Which thing happens depends on the site's input mode: Spatial moves DOM
 * focus, Cursor drives the virtual pointer and Arrows hands the D-pad to the page.
 */
export class InputRouter {
  constructor(private readonly host: InputHost, private readonly cursor: VirtualCursor) {}

  async run(input: ControllerEvent): Promise<void> {
    const wc = this.host.activeWebContents;
    switch (input.type) {
      case "connected":
        this.host.setControllerConnected(input.connected, input.family);
        break;
      case "direction":
        if (!wc) return;
        if (this.host.inputMode === "Spatial") await spatialMove(wc, input.direction);
        else if (this.host.inputMode === "Cursor") {
          const size = this.host.pageSize();
          const step = 24;
          const dx = input.direction === "left" ? -step : input.direction === "right" ? step : 0;
          const dy = input.direction === "up" ? -step : input.direction === "down" ? step : 0;
          await this.cursor.moveBy(wc, dx, dy, size.width, size.height);
        } else sendArrow(wc, input.direction);
        break;
      case "activate":
        if (!wc) return;
        if (this.host.inputMode === "Cursor") {
          this.cursor.click(wc);
          break;
        }
        // The tab state is the cheap gate: a page that never played media keeps A on focus, with no round trip.
        if (this.host.isPlayingMedia() && (await spatialPlayPause(wc)) === "media") break;
        if (this.host.inputMode === "Spatial") await spatialActivate(wc);
        else sendKey(wc, "Return");
        break;
      case "cursor-move":
        if (wc && this.host.inputMode === "Cursor") {
          const size = this.host.pageSize();
          await this.cursor.moveBy(wc, input.dx, input.dy, size.width, size.height);
        }
        break;
      case "cursor-click": if (wc && this.host.inputMode === "Cursor") this.cursor.click(wc); break;
      case "scroll": if (wc) this.cursor.scroll(wc, input.notches); break;
    }
  }
}
