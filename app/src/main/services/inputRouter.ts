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
  openKeyboard(target: "address" | "page"): void;
  /** The D-pad left the top of the page: the tabs and the toolbar take it. */
  enterChrome(): void;
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
        if (this.host.inputMode === "Spatial") {
          if ((await spatialMove(wc, input.direction)) === "edge") this.host.enterChrome();
        } else if (this.host.inputMode === "Cursor") {
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
        if (this.host.inputMode === "Spatial") {
          if ((await spatialActivate(wc)) === "edit") this.host.openKeyboard("page");
        } else sendKey(wc, "Return");
        break;
      // The stick's pointer works in every mode but Arrows, whose sites (YouTube TV, Twitch) are built for the arrow keys.
      case "cursor-move":
        if (wc && this.host.inputMode !== "Arrows") {
          const size = this.host.pageSize();
          await this.cursor.moveBy(wc, input.dx, input.dy, size.width, size.height);
        }
        break;
      case "cursor-click": if (wc && this.host.inputMode !== "Arrows") this.cursor.click(wc, input.button); break;
      case "scroll":
        if (!wc) return;
        // Never pointed anywhere yet: the wheel turns over the middle of the page, not over a corner.
        if (!this.cursor.placed) {
          const size = this.host.pageSize();
          this.cursor.place(size.width / 2, size.height / 2, size.width, size.height);
        }
        this.cursor.scroll(wc, input.notches, input.sideways);
        break;
    }
  }
}
